import * as db from '../db.js';
import { timetableRepository } from './timetableRepository.js';
import { notify, bookingFacts } from '../notifications/notify.js';

/** The room types CRAS knows (rooms_type_check). Committee Rooms and Auditoriums are restricted. */
export const ROOM_TYPES = Object.freeze(['Lecture Room', 'Lab', 'Auditorium', 'Committee Room']);

/**
 * Repository for Room-related database operations
 */
export const roomRepository = {
  /**
   * Find a room by ID
   */
  findById: async (id, client = db) => {
    const result = await client.query('SELECT * FROM rooms WHERE id = $1', [id]);
    return result.rows[0];
  },

  /**
   * Find a room by name (case-insensitive)
   */
  findByName: async (name, client = db) => {
    const result = await client.query('SELECT * FROM rooms WHERE UPPER(name) = UPPER($1) AND is_active', [name]);
    return result.rows[0];
  },

  create: async (data, client = db) => {
    const { name, building, floor, capacity, type, has_ac, has_projector, description, student_access } = data;
    const query = 'INSERT INTO rooms (name, building, floor, capacity, type, has_ac, has_projector, description, student_access) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *';
    const result = await client.query(query, [
      name, building, floor, capacity, type || 'Lecture Room', 
      has_ac || false, has_projector || false, description || null, 
      student_access !== undefined ? student_access : true
    ]);
    return result.rows[0];
  },

  /**
   * Set an admin weekly block on a room-hour (isAvailable = false) or lift it (true: the block is
   * soft-deleted). room_availability holds blocks only; classes come from the timetables.
   */
  upsertAvailability: async (roomId, day, hour, isAvailable, userId = null, client = db) => {
    if (isAvailable) {
      return client.query(
        `UPDATE room_availability SET is_active = FALSE, deactivated_at = NOW(), user_id = $4
          WHERE room_id = $1 AND day = $2 AND hour = $3 AND is_active`,
        [roomId, day, hour, userId],
      );
    }
    return client.query(
      `INSERT INTO room_availability (room_id, day, hour, is_available, user_id, source)
       VALUES ($1, $2, $3, FALSE, $4, 'manual')
       ON CONFLICT (room_id, day, hour) DO UPDATE
         SET is_available = FALSE, user_id = $4, source = 'manual', is_active = TRUE, deactivated_at = NULL`,
      [roomId, day, hour, userId],
    );
  },

  /**
   * Get all rooms with their booking status for a specific time slot (Admin)
   */
  getAdminRoomStatus: async (startTime, endTime, client = db) => {
    const query = `
      SELECT 
        r.id as room_id, 
        r.name as room_name,
        r.building,
        r.floor,
        b.id as booking_id,
        b.purpose,
        u.name as booked_by_name,
        u.email as booked_by_email
      FROM rooms r
      LEFT JOIN bookings b ON r.id = b.room_id 
        AND b.status = 'ACTIVE'
        AND tstzrange(b.start_time, b.end_time) && tstzrange($1::timestamptz, $2::timestamptz)
      LEFT JOIN users u ON b.created_by = u.id
      WHERE r.is_active
      ORDER BY r.name ASC
    `;
    const result = await client.query(query, [startTime, endTime]);
    return result.rows;
  },

  /**
   * Find available rooms with filters
   */
  findFiltered: async (capacity, ac, projector, building, floor, type) => {
    let query = 'SELECT * FROM rooms WHERE is_active';
    const params = [];

    if (capacity) { params.push(capacity); query += ` AND capacity >= $${params.length}`; }
    if (ac === 'true') query += ' AND has_ac = TRUE';
    if (projector === 'true') query += ' AND has_projector = TRUE';
    if (building) {
      let buildingArr = Array.isArray(building) ? building : [building];
      // Handle case where single query param might contain a comma
      if (buildingArr.length === 1 && typeof buildingArr[0] === 'string' && buildingArr[0].includes(',')) {
        buildingArr = buildingArr[0].split(',');
      }
      const filteredBuildings = buildingArr.filter(b => b && b !== 'all');
      if (filteredBuildings.length > 0) {
        params.push(filteredBuildings);
        query += ` AND building = ANY($${params.length})`;
      }
    }
    
    if (floor && floor !== 'all') {
      const dbFloor = floor === 'G' ? 0 : parseInt(floor);
      if (!isNaN(dbFloor)) {
        params.push(dbFloor);
        query += ` AND floor = $${params.length}`;
      }
    }

    if (type && type !== 'all') {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }

    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Find available rooms with filters and pagination
   */
  findFilteredPaginated: async (filters) => {
    const { capacity, ac, projector, building, floor, type, limit, offset, excludeTypes = [] } = filters;
    let baseQuery = 'FROM rooms WHERE is_active';
    const params = [];
    if (excludeTypes.length) { params.push(excludeTypes); baseQuery += ` AND (type IS NULL OR type <> ALL($${params.length}))`; }

    if (capacity) { params.push(capacity); baseQuery += ` AND capacity >= $${params.length}`; }
    if (ac === 'true' || ac === true) baseQuery += ' AND has_ac = TRUE';
    if (projector === 'true' || projector === true) baseQuery += ' AND has_projector = TRUE';
    if (building) {
      let buildingArr = Array.isArray(building) ? building : [building];
      if (buildingArr.length === 1 && typeof buildingArr[0] === 'string' && buildingArr[0].includes(',')) {
        buildingArr = buildingArr[0].split(',');
      }
      const filteredBuildings = buildingArr.filter(b => b && b !== 'all');
      if (filteredBuildings.length > 0) {
        params.push(filteredBuildings);
        baseQuery += ` AND building = ANY($${params.length})`;
      }
    }
    
    if (floor && floor !== 'all') {
      const dbFloor = floor === 'G' ? 0 : parseInt(floor);
      if (!isNaN(dbFloor)) {
        params.push(dbFloor);
        baseQuery += ` AND floor = $${params.length}`;
      }
    }

    if (type && type !== 'all') {
      params.push(type);
      baseQuery += ` AND type = $${params.length}`;
    }

    const countQuery = `SELECT COUNT(*) ${baseQuery}`;
    const dataQuery = `SELECT * ${baseQuery} ORDER BY name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    const [countRes, dataRes] = await Promise.all([
      db.query(countQuery, params),
      db.query(dataQuery, [...params, limit, offset])
    ]);

    return {
      total: parseInt(countRes.rows[0].count),
      rooms: dataRes.rows
    };
  },

  /**
   * The calendar feed, as one `{ room_id, room_name, day, hour, is_available }` list:
   *  - weekly class hours from the timetables (by room id) — the same classes the booking check uses;
   *  - admin weekly blocks;
   *  - dated releases (approved class cancellations, reschedules), last, so they win over a block or
   *    class on that date and hour, as they do server-side (checkRoomTimetable) — NEW-P5-4.
   */
  getAllAvailability: async () => {
    const [classes, rest] = await Promise.all([
      timetableRepository.weeklyClassHours(),
      db.query(`
        SELECT ra.room_id, r.name AS room_name, ra.day, ra.hour, FALSE AS is_available, ra.user_id, 'block' AS source
          FROM room_availability ra
          JOIN rooms r ON ra.room_id = r.id
         WHERE r.is_active AND ra.is_active
        UNION ALL
        SELECT rel.room_id, r.name, rel.release_date::text, h, TRUE, rel.created_by, 'release'
          FROM room_slot_releases rel
          JOIN rooms r ON r.id = rel.room_id
         CROSS JOIN LATERAL generate_series(rel.start_hour, rel.end_hour - 1) AS h
         WHERE rel.is_active AND r.is_active
           AND rel.release_date >= (NOW() AT TIME ZONE 'Asia/Kolkata')::date - 7
        ORDER BY source, room_id, day, hour
      `),
    ]);
    const classRows = classes.map((c) => ({ ...c, is_available: false, user_id: null, source: 'class' }));
    const blocks = rest.rows.filter((r) => r.source === 'block');
    const releases = rest.rows.filter((r) => r.source === 'release');
    return [...classRows, ...blocks, ...releases];
  },

  /**
   * Override room availability (e.g. for cancelled classes)
   */
  overrideAvailability: async (roomName, day, hour, isAvailable, userId = null) => {
    const room = await roomRepository.findByName(roomName);
    if (!room) throw new Error('Room not found');
    
    return roomRepository.upsertAvailability(room.id, day, hour, isAvailable, userId);
  },

  /**
   * Get availability overrides created by a specific user
   */
  getUserOverrides: async (userId) => {
    const query = `
      SELECT ra.*, r.name as room_name 
      FROM room_availability ra
      JOIN rooms r ON ra.room_id = r.id
      WHERE ra.user_id = $1 AND ra.is_active
      ORDER BY ra.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Update room details
   */
  update: async (id, data, client = db) => {
    // Partial update: only the fields sent are changed (NEW-RTT-4).
    const FIELDS = ['name', 'building', 'floor', 'capacity', 'has_ac', 'has_projector', 'type', 'description', 'student_access'];
    const sets = [];
    const values = [];
    for (const f of FIELDS) {
      if (data[f] !== undefined) {
        values.push(f === 'description' && data[f] === '' ? null : data[f]);
        sets.push(`${f} = $${values.length}`);
      }
    }
    if (!sets.length) {
      const { rows } = await client.query('SELECT * FROM rooms WHERE id = $1 AND is_active', [id]);
      return rows[0];
    }
    values.push(id);
    const result = await client.query(
      `UPDATE rooms SET ${sets.join(', ')} WHERE id = $${values.length} AND is_active RETURNING *`,
      values,
    );
    return result.rows[0];
  },

  /**
   * Soft-delete a room. Its upcoming ACTIVE/PENDING bookings are cancelled (kept, not removed)
   * because they can no longer take place; past bookings and history are untouched.
   */
  delete: async (id, client = db) => {
    const result = await client.query(
      'UPDATE rooms SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1 AND is_active RETURNING *',
      [id],
    );
    if (result.rows[0]) {
      await client.query(
        `UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
          WHERE room_id = $1 AND status IN ('ACTIVE', 'PENDING') AND start_time > NOW()
          RETURNING id`,
        [id],
      ).then(async ({ rows }) => {
        // Tell the bookers and their faculty why (notifications outbox, same transaction).
        for (const { id: bookingId } of rows) {
          const facts = await bookingFacts(client, bookingId);
          const data = { ...facts.data, studentName: facts.data.ownerName, by: 'An administrator', reason: `room ${result.rows[0].name} was removed` };
          const meta = { entityType: 'booking', entityId: bookingId };
          await notify(client, [{ userId: facts.booking.created_by }], 'booking_cancelled', data, meta);
          if (facts.booking.faculty_id) await notify(client, [{ facultyId: facts.booking.faculty_id }], 'supervised_booking_cancelled', data, meta);
        }
        // Withdraw class releases created by cancelled reschedule bookings (NEW-P4-3).
        if (rows.length) {
          await timetableRepository.withdrawReleases('reschedule', rows.map((r) => r.id), client);
        }
      });
    }
    return result.rows[0];
  }
};

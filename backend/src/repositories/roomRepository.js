import * as db from '../db.js';

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
    const result = await client.query('SELECT * FROM rooms WHERE UPPER(name) = UPPER($1)', [name]);
    return result.rows[0];
  },

  create: async (data, client = db) => {
    const { name, building, floor, capacity, type, has_ac, has_projector } = data;
    const query = 'INSERT INTO rooms (name, building, floor, capacity, type, has_ac, has_projector) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *';
    const result = await client.query(query, [name, building, floor, capacity, type || 'Lecture Room', has_ac || false, has_projector || false]);
    return result.rows[0];
  },

  /**
   * Upsert room availability
   */
  upsertAvailability: async (roomId, day, hour, isAvailable, userId = null, client = db) => {
    const query = `
      INSERT INTO room_availability (room_id, day, hour, is_available, user_id) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (room_id, day, hour) DO UPDATE SET is_available = $4, user_id = $5`;
    return client.query(query, [roomId, day, hour, isAvailable, userId]);
  },

  /**
   * Bulk insert default availability
   */
  insertDefaultAvailability: async (roomId, days, hours, client = db) => {
    for (const d of days) {
      for (const h of hours) {
        await client.query(
          'INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, $2, $3, FALSE) ON CONFLICT DO NOTHING', 
          [roomId, d, h]
        );
      }
    }
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
      ORDER BY r.name ASC
    `;
    const result = await client.query(query, [startTime, endTime]);
    return result.rows;
  },

  /**
   * Find available rooms with filters
   */
  findFiltered: async (capacity, ac, projector, building, floor, type) => {
    let query = 'SELECT * FROM rooms WHERE 1=1';
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
    const { capacity, ac, projector, building, floor, type, limit, offset } = filters;
    let baseQuery = 'FROM rooms WHERE 1=1';
    const params = [];

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
   * Get all room availability entries
   */
  getAllAvailability: async () => {
    const result = await db.query(`
      SELECT ra.*, r.name as room_name 
      FROM room_availability ra
      JOIN rooms r ON ra.room_id = r.id
    `);
    return result.rows;
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
      WHERE ra.user_id = $1
      ORDER BY ra.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Update room details
   */
  update: async (id, data, client = db) => {
    const { name, building, floor, capacity, has_ac, has_projector, type } = data;
    const query = `
      UPDATE rooms 
      SET name = $1, building = $2, floor = $3, capacity = $4, has_ac = $5, has_projector = $6, type = $7
      WHERE id = $8
      RETURNING *
    `;
    const result = await client.query(query, [name, building, floor, capacity, has_ac, has_projector, type, id]);
    return result.rows[0];
  },

  /**
   * Delete a room
   */
  delete: async (id, client = db) => {
    const query = 'DELETE FROM rooms WHERE id = $1 RETURNING *';
    const result = await client.query(query, [id]);
    return result.rows[0];
  }
};

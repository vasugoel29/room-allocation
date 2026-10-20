import * as db from '../db.js';

const BOOKING_SELECT = `
  SELECT b.*, r.name as room_name, u.name as user_name, u.role as user_role,
         u.branch, u.year, u.section, u.department_name,
         f.name as faculty_name,
         CASE 
           WHEN u.role IN ('ADMIN', 'FACULTY') THEN u.name
           ELSE CONCAT(
             u.branch, 
             '-', 
             u.section, 
             ' ', 
             CASE CEIL(u.semester::float / 2)::int
               WHEN 1 THEN '1st'
               WHEN 2 THEN '2nd'
               WHEN 3 THEN '3rd'
               WHEN 4 THEN '4th'
               ELSE CONCAT(CEIL(u.semester::float / 2)::text, 'th')
             END,
             ' Year'
           )
         END as class_name
  FROM bookings b
  JOIN rooms r ON b.room_id = r.id
  JOIN users u ON b.created_by = u.id
  LEFT JOIN faculties f ON b.faculty_id = f.id
`;

/**
 * Repository for Booking-related database operations
 */
export const bookingRepository = {
  /**
   * ACTIVE and PENDING bookings overlapping [from, to) — the calendar's occupancy. Bounded by
   * the window, not a row limit, so nothing silently drops off (FE-12, PERF-01).
   */
  findOpenInRange: async (from, to) => {
    const result = await db.query(
      `${BOOKING_SELECT}
       WHERE b.status IN ('ACTIVE', 'PENDING') AND b.start_time < $2 AND b.end_time > $1
       ORDER BY b.start_time, b.room_id`,
      [from, to],
    );
    return result.rows;
  },

  /** A user's own bookings and the ones they supervise as faculty, newest first. */
  findForPerson: async (userId, facultyId, limit) => {
    const result = await db.query(
      `${BOOKING_SELECT}
       WHERE b.created_by = $1 OR ($2::int IS NOT NULL AND b.faculty_id = $2)
       ORDER BY b.start_time DESC
       LIMIT $3`,
      [userId, facultyId ?? null, limit],
    );
    return result.rows;
  },

  /**
   * Find bookings based on filters
   */
  findBookings: async (filters) => {
    const { room_id, user_id, start_date, end_date, slot, limit, offset } = filters;
    let query = `${BOOKING_SELECT}
      WHERE 1=1
    `;
    const params = [];
    if (room_id) { params.push(room_id); query += ` AND b.room_id = $${params.length}`; }
    if (user_id) { params.push(user_id); query += ` AND b.created_by = $${params.length}`; }
    if (start_date) { params.push(start_date); query += ` AND b.start_time >= $${params.length}`; }
    if (end_date) { params.push(end_date); query += ` AND b.end_time <= $${params.length}`; }
    if (slot) { params.push(slot); query += ` AND EXTRACT(HOUR FROM b.start_time AT TIME ZONE 'Asia/Kolkata') = $${params.length}`; }

    query += " ORDER BY b.created_at DESC";
    
    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }
    if (offset) {
      params.push(offset);
      query += ` OFFSET $${params.length}`;
    }
    
    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Count total bookings based on filters (for pagination)
   */
  countBookings: async (filters) => {
    const { room_id, user_id, start_date, end_date, slot } = filters;
    let query = 'SELECT COUNT(*) FROM bookings b WHERE 1=1';
    const params = [];

    if (room_id) { params.push(room_id); query += ` AND b.room_id = $${params.length}`; }
    if (user_id) { params.push(user_id); query += ` AND b.created_by = $${params.length}`; }
    if (start_date) { params.push(start_date); query += ` AND b.start_time >= $${params.length}`; }
    if (end_date) { params.push(end_date); query += ` AND b.end_time <= $${params.length}`; }
    if (slot) { params.push(slot); query += ` AND EXTRACT(HOUR FROM b.start_time AT TIME ZONE 'Asia/Kolkata') = $${params.length}`; }

    const result = await db.query(query, params);
    return parseInt(result.rows[0].count);
  },

  /**
   * Find a booking by ID
   */
  findById: async (id, client = db) => {
    const result = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
    return result.rows[0];
  },

  /**
   * Check for room level conflicts
   */
  checkRoomConflict: async (roomId, startTime, endTime, client = db) => {
    const result = await client.query(
      `SELECT * FROM bookings 
       WHERE room_id = $1 AND status = 'ACTIVE' 
       AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [roomId, startTime, endTime]
    );
    return result.rows;
  },

  /**
   * Check for user level conflicts
   */
  checkUserConflict: async (userId, startTime, endTime, client = db) => {
    const result = await client.query(
      `SELECT b.*, r.name as room_name 
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       WHERE b.created_by = $1 AND b.status = 'ACTIVE' 
       AND tstzrange(b.start_time, b.end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [userId, startTime, endTime]
    );
    return result.rows;
  },

  /**
   * Insert a new booking
   */
  create: async (data, client = db) => {
    const { room_id, start_time, end_time, created_by, purpose, faculty_id, status,
      reschedule_room_id = null, reschedule_date = null, reschedule_hour = null } = data;
    const query = `
      INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, faculty_id, status,
                            reschedule_room_id, reschedule_date, reschedule_hour)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`;
    const values = [room_id, start_time, end_time, created_by, purpose, faculty_id || null, status,
      reschedule_room_id, reschedule_date, reschedule_hour];
    const result = await client.query(query, values);
    return result.rows[0];
  },

  /**
   * Update booking status
   */
  updateStatus: async (id, status, client = db) => {
    const query = `UPDATE bookings SET status = $1, updated_at = NOW()${status === 'CANCELLED' ? ', cancelled_at = NOW()' : ''} WHERE id = $2 RETURNING *`;
    const result = await client.query(query, [status, id]);
    return result.rows[0];
  },

  /**
   * Update booking times and room
   */
  updateBooking: async (id, data, client = db) => {
    const { start_time, end_time, room_id } = data;
    const query = 'UPDATE bookings SET start_time = $1, end_time = $2, room_id = $3, updated_at = NOW() WHERE id = $4 RETURNING *';
    const values = [start_time, end_time, room_id, id];
    const result = await client.query(query, values);
    return result.rows[0];
  },

  /**
   * Find pending requests for a faculty member
   */
  findPendingByFaculty: async (facultyId) => {
    const query = `
      SELECT b.*, r.name as room_name, u.name as user_name, u.email as user_email
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.created_by = u.id
      WHERE b.faculty_id = $1 AND b.status = 'PENDING'
      ORDER BY b.created_at DESC
    `;
    const result = await db.query(query, [facultyId]);
    return result.rows;
  },

  /**
   * Reject conflicting pending bookings
   */
  rejectConflicts: async (roomId, approvedId, startTime, endTime, client = db) => {
    const query = `
      UPDATE bookings SET status = 'REJECTED', updated_at = NOW() 
      WHERE room_id = $1 AND status = 'PENDING' AND id != $2
      AND tstzrange(start_time, end_time) && tstzrange($3::timestamptz, $4::timestamptz)
      RETURNING id, created_by`;
    return client.query(query, [roomId, approvedId, startTime, endTime]);
  }
};

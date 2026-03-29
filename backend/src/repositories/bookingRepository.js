import * as db from '../db.js';

/**
 * Repository for Booking-related database operations
 */
export const bookingRepository = {
  /**
   * Find bookings based on filters
   */
  findBookings: async (filters) => {
    const { room_id, user_id, start_date, end_date, slot } = filters;
    let query = `
      SELECT b.*, r.name as room_name, u.name as user_name, u.role as user_role,
             u.branch, u.year, u.section, d.name as department_name,
             CASE 
               WHEN u.role IN ('admin', 'FACULTY') THEN u.name
               ELSE CONCAT(u.branch, '-', u.section, ' ', u.year, ' Year')
             END as class_name
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.created_by = u.id
      LEFT JOIN departments d ON u.department_id = d.id
      WHERE 1=1
    `;
    const params = [];
    if (room_id) { params.push(room_id); query += ` AND b.room_id = $${params.length}`; }
    if (user_id) { params.push(user_id); query += ` AND b.created_by = $${params.length}`; }
    if (start_date) { params.push(start_date); query += ` AND b.start_time >= $${params.length}`; }
    if (end_date) { params.push(end_date); query += ` AND b.end_time <= $${params.length}`; }
    if (slot) { params.push(slot); query += ` AND EXTRACT(HOUR FROM b.start_time) = $${params.length}`; }

    query += " ORDER BY b.created_at DESC";
    
    const result = await db.query(query, params);
    return result.rows;
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
    const { room_id, start_time, end_time, created_by, purpose, faculty_id, status } = data;
    const query = `
      INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, faculty_id, status) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *`;
    const values = [room_id, start_time, end_time, created_by, purpose, faculty_id || null, status];
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
   * Create history entry for reschedule
   */
  createHistory: async (data, client = db) => {
    const { booking_id, previous_start_time, previous_end_time, previous_room_id, modified_by, change_type } = data;
    const query = `
      INSERT INTO booking_history (booking_id, previous_start_time, previous_end_time, previous_room_id, modified_by, change_type) 
      VALUES ($1, $2, $3, $4, $5, $6)`;
    const values = [booking_id, previous_start_time, previous_end_time, previous_room_id, modified_by, change_type];
    return client.query(query, values);
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
      AND tstzrange(start_time, end_time) && tstzrange($3::timestamptz, $4::timestamptz)`;
    return client.query(query, [roomId, approvedId, startTime, endTime]);
  }
};

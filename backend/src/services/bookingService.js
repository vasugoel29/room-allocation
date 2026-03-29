import * as db from '../db.js';
import logger from '../utils/logger.js';

/**
 * Fetch bookings with optional filters
 */
export const getBookings = async (filters) => {
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
};

/**
 * Handles the logic for creating a single booking
 */
export const createBooking = async (client, reqData, userId) => {
  const { room_id, start_time, end_time, purpose, faculty_id } = reqData;

  // Check Room conflict
  const roomConflict = await client.query(
    `SELECT * FROM bookings 
     WHERE room_id = $1 AND status = 'ACTIVE' 
     AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
    [room_id, start_time, end_time]
  );

  if (roomConflict.rows.length > 0) {
    logger.info('Conflict: Room occupied', { room_id, start_time, user_id: userId });
    return { error: 'Room is already booked for this time period (or pending approval)', status: 409 };
  }

  // Check User conflict
  const userConflict = await client.query(
    `SELECT b.*, r.name as room_name 
     FROM bookings b
     JOIN rooms r ON b.room_id = r.id
     WHERE b.created_by = $1 AND b.status = 'ACTIVE' 
     AND tstzrange(b.start_time, b.end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
    [userId, start_time, end_time]
  );

  if (userConflict.rows.length > 0) {
    logger.info('Conflict: User busy', { user_id: userId, start_time });
    return { 
      error: `You already have another booking during this time in Room ${userConflict.rows[0].room_name}`, 
      status: 409 
    };
  }

  // If faculty_id is provided, the booking starts as PENDING until approved.
  const status = faculty_id ? 'PENDING' : 'ACTIVE';

  const query = 'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, faculty_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *';
  const values = [room_id, start_time, end_time, userId, purpose, faculty_id || null, status];
  const result = await client.query(query, values);
  
  // Reschedule Logic
  const { reschedule_room_name } = reqData;
  if (reschedule_room_name) {
    await handleRescheduleFreedUpRoom(client, reqData, start_time);
  }

  return { data: result.rows[0], status: 201 };
};

const handleRescheduleFreedUpRoom = async (client, reqData, start_time) => {
  const { reschedule_room_name, reschedule_day, reschedule_hour } = reqData;
  
  let resRoomRes = await client.query('SELECT id FROM rooms WHERE UPPER(name) = UPPER($1)', [reschedule_room_name]);
  let resRoomId;
  
  if (resRoomRes.rows.length === 0) {
    const safeRoomName = String(reschedule_room_name || '').trim();
    const firstDigit = safeRoomName.charAt(0);
    const building = /^\d$/.test(firstDigit) ? `${firstDigit}th Block` : 'Unknown';

    const newResRoom = await client.query(
      'INSERT INTO rooms (name, building, floor, capacity) VALUES ($1, $2, $3, $4) RETURNING id',
      [safeRoomName, building, 0, 40]
    );
    resRoomId = newResRoom.rows[0].id;

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const defaultHours = Array.from({ length: 10 }, (_, i) => i + 8);
    for (const d of days) {
      for (const h of defaultHours) {
        await client.query('INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, $2, $3, FALSE) ON CONFLICT DO NOTHING', [resRoomId, d, h]);
      }
    }
  } else {
    resRoomId = resRoomRes.rows[0].id;
  }

  let dayName, hour;
  if (reschedule_day && reschedule_hour !== undefined) {
    dayName = reschedule_day;
    hour = parseInt(reschedule_hour);
  } else {
    const dateObj = new Date(start_time);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayName = days[dateObj.getDay()];
    hour = dateObj.getHours();
  }

  await client.query(
    `INSERT INTO room_availability (room_id, day, hour, is_available) 
     VALUES ($1, $2, $3, TRUE)
     ON CONFLICT (room_id, day, hour) DO UPDATE SET is_available = TRUE`,
    [resRoomId, dayName, hour]
  );
  logger.info('Reschedule: Freed up room', { reschedule_room_name, dayName, hour });
};

/**
 * Cancel a booking
 */
export const cancelBooking = async (client, bookingId, userId, isAdmin) => {
  const result = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  const booking = result.rows[0];

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.created_by !== userId && !isAdmin) return { error: 'Not authorized', status: 403 };

  await client.query("UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1", [bookingId]);
  return { status: 200 };
};

/**
 * Reschedule a booking (Legacy/Manual)
 */
export const rescheduleBooking = async (client, bookingId, data, userId) => {
  const { start_time, end_time, room_id } = data;
  const current = await client.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
  const booking = current.rows[0];

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.created_by !== userId) return { error: 'Not authorized', status: 403 };

  await client.query(
    'INSERT INTO booking_history (booking_id, previous_start_time, previous_end_time, previous_room_id, modified_by, change_type) VALUES ($1, $2, $3, $4, $5, $6)',
    [bookingId, booking.start_time, booking.end_time, booking.room_id, userId, 'RESCHEDULE']
  );

  const updateResult = await client.query(
    'UPDATE bookings SET start_time = $1, end_time = $2, room_id = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
    [start_time || booking.start_time, end_time || booking.end_time, room_id || booking.room_id, bookingId]
  );

  return { data: updateResult.rows[0], status: 200 };
};

/**
 * Faculty Portal Queries
 */
export const getPendingFacultyRequests = async (facultyId) => {
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
};

export const approveBooking = async (client, id, facultyId, isAdmin) => {
  const condition = isAdmin ? 'id = $1' : 'id = $1 AND faculty_id = $2';
  const params = isAdmin ? [id] : [id, facultyId];
  
  const current = await client.query(`SELECT * FROM bookings WHERE ${condition}`, params);
  const booking = current.rows[0];
  
  if (!booking) return { error: 'Booking not found or unauthorized', status: 404 };
  if (booking.status !== 'PENDING') return { error: 'Booking is not pending', status: 400 };

  // Conflict check
  const roomConflict = await client.query(
    `SELECT * FROM bookings 
     WHERE room_id = $1 AND status = 'ACTIVE' 
     AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
    [booking.room_id, booking.start_time, booking.end_time]
  );

  if (roomConflict.rows.length > 0) return { error: 'Room already booked', status: 409 };

  const updateResult = await client.query(
    "UPDATE bookings SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1 RETURNING *",
    [id]
  );

  // Reject others
  await client.query(
    `UPDATE bookings SET status = 'REJECTED', updated_at = NOW() 
     WHERE room_id = $1 AND status = 'PENDING' AND id != $2
     AND tstzrange(start_time, end_time) && tstzrange($3::timestamptz, $4::timestamptz)`,
    [booking.room_id, id, booking.start_time, booking.end_time]
  );

  return { data: updateResult.rows[0], status: 200 };
};

export const rejectBooking = async (id, facultyId, isAdmin) => {
  const condition = isAdmin ? 'id = $1' : 'id = $1 AND faculty_id = $2';
  const params = isAdmin ? [id] : [id, facultyId];
  
  const result = await db.query(
    `UPDATE bookings SET status = 'REJECTED', updated_at = NOW() WHERE ${condition} AND status = 'PENDING' RETURNING id`,
    params
  );
  
  if (result.rows.length === 0) return { error: 'Booking not found or unauthorized', status: 404 };
  return { status: 200 };
};

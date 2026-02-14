import logger from '../utils/logger.js';

/**
 * Handles the logic for creating a single booking
 */
async function createBooking(client, { room_id, start_time, end_time, purpose, is_semester }, userId) {
  // Check Room conflict
  const roomConflict = await client.query(
    `SELECT * FROM bookings 
     WHERE room_id = $1 AND status = 'ACTIVE' 
     AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
    [room_id, start_time, end_time]
  );

  if (roomConflict.rows.length > 0) {
    logger.info('Conflict: Room occupied', { room_id, start_time, user_id: userId });
    return { error: 'Room is already booked for this time period', status: 409 };
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

  const query = 'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, is_semester_booking) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
  const values = [room_id, start_time, end_time, userId, purpose, is_semester];
  const result = await client.query(query, values);
  
  return { data: result.rows[0], status: 201 };
}

/**
 * Handles the logic for creating a semester booking (15 weeks)
 */
async function createSemesterBooking(client, { room_id, start_time, end_time, purpose }, userId) {
  const weeks = 15;
  
  for (let i = 0; i < weeks; i++) {
    const currentStart = new Date(start_time);
    currentStart.setDate(currentStart.getDate() + (i * 7));
    const currentEnd = new Date(end_time);
    currentEnd.setDate(currentEnd.getDate() + (i * 7));

    // Check Room conflict
    const roomConflict = await client.query(
      `SELECT * FROM bookings 
       WHERE room_id = $1 AND status = 'ACTIVE' 
       AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [room_id, currentStart.toISOString(), currentEnd.toISOString()]
    );

    if (roomConflict.rows.length > 0) {
      logger.info('Semester Conflict: Room occupied', { room_id, week: i, start_time: currentStart.toISOString() });
      return { error: `Conflict at week ${i+1}. Semester booking failed.`, status: 409 };
    }

    // Check User conflict
    const userConflict = await client.query(
      `SELECT b.*, r.name as room_name 
       FROM bookings b
       JOIN rooms r ON b.room_id = r.id
       WHERE b.created_by = $1 AND b.status = 'ACTIVE' 
       AND tstzrange(b.start_time, b.end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [userId, currentStart.toISOString(), currentEnd.toISOString()]
    );

    if (userConflict.rows.length > 0) {
      logger.info('Semester Conflict: User busy', { user_id: userId, week: i });
      return { error: `User busy at week ${i+1} in Room ${userConflict.rows[0].room_name}`, status: 409 };
    }

    await client.query(
      'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, is_semester_booking) VALUES ($1, $2, $3, $4, $5, TRUE)',
      [room_id, currentStart.toISOString(), currentEnd.toISOString(), userId, purpose]
    );
  }

  return { data: { status: 'Success', message: 'Semester booking confirmed for 15 weeks' }, status: 201 };
}

export {
  createBooking,
  createSemesterBooking
};

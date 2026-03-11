import * as db from '../db.js';
import logger from '../utils/logger.js';
import * as bookingService from '../services/bookingService.js';

export const getBookings = async (req, res) => {
  const { room_id, user_id, start_date, end_date, slot } = req.query;
  let query = `
    SELECT b.*, r.name as room_name, u.name as user_name 
    FROM bookings b
    JOIN rooms r ON b.room_id = r.id
    JOIN users u ON b.created_by = u.id
    WHERE 1=1
  `;
  const params = [];
  if (room_id) { params.push(room_id); query += ` AND b.room_id = $${params.length}`; }
  if (user_id) { params.push(user_id); query += ` AND b.created_by = $${params.length}`; }
  if (start_date) { params.push(start_date); query += ` AND b.start_time >= $${params.length}`; }
  if (end_date) { params.push(end_date); query += ` AND b.end_time <= $${params.length}`; }
  if (slot) { params.push(slot); query += ` AND EXTRACT(HOUR FROM b.start_time) = $${params.length}`; }

  query += " ORDER BY b.created_at DESC";

  try {
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

export const createBooking = async (req, res) => {
  const { room_id, start_time, end_time, purpose } = req.body;
  const userId = req.user.id;
  const startTimeObj = new Date(start_time);
  
  if (startTimeObj < new Date()) return res.status(400).json({ error: 'Cannot book in the past' });
  
  if (Math.abs(startTimeObj - new Date()) / (1000 * 60 * 60 * 24) > 7) {
    return res.status(400).json({ error: 'Regular bookings allowed only for the current week' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.createBooking(client, { room_id, start_time, end_time, purpose, reschedule_room_name: req.body.reschedule_room_name, reschedule_day: req.body.reschedule_day, reschedule_hour: req.body.reschedule_hour }, userId);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    logger.info('Booking created', { booking_id: result.data.id, user_id: userId, room_id, start_time });
    res.status(201).json(result.data);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
};

export const cancelBooking = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
    const booking = result.rows[0];

    if (!booking) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }
    if (booking.created_by !== userId) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Only owner can cancel' }); }

    await client.query("UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1", [id]);
    await client.query('COMMIT');
    logger.info('Booking cancelled', { booking_id: id, user_id: userId, room_id: booking.room_id });
    res.json({ status: 'Success', message: 'Booking cancelled' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Cancellation failed' });
  } finally {
    client.release();
  }
};

export const rescheduleBooking = async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, room_id } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
    const booking = current.rows[0];
    if (!booking) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Booking not found' }); }
    
    // Security Fix: Prevent IDOR (only owner can reschedule)
    if (booking.created_by !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only owner can reschedule' });
    }

    await client.query(
      'INSERT INTO booking_history (booking_id, previous_start_time, previous_end_time, previous_room_id, modified_by, change_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, current.rows[0].start_time, current.rows[0].end_time, current.rows[0].room_id, req.user.id, 'RESCHEDULE']
    );

    const updateResult = await client.query(
      'UPDATE bookings SET start_time = $1, end_time = $2, room_id = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
      [start_time || current.rows[0].start_time, end_time || current.rows[0].end_time, room_id || current.rows[0].room_id, id]
    );

    await client.query('COMMIT');
    res.json(updateResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Rescheduling failed' });
  } finally {
    client.release();
  }
};

export const quickBook = async (req, res) => {
  const { room_name, target_user_id, date, slot, purpose } = req.body;
  const adminId = req.user.id;

  if (!room_name || !date || slot === undefined) {
    return res.status(400).json({ error: 'Missing required fields: room_name, date, slot' });
  }

  const userId = target_user_id || adminId;
  try {
    await client.query('BEGIN');

    // 1. Resolve or create room
    let roomRes = await client.query('SELECT id FROM rooms WHERE UPPER(name) = UPPER($1)', [room_name]);
    let roomId;
    if (roomRes.rows.length === 0) {
      const safeName = String(room_name).trim();
      const firstDigit = safeName.charAt(0);
      const building = /^\d$/.test(firstDigit) ? `${firstDigit}th Block` : 'Unknown';
      const floor = safeName.length >= 2 ? parseInt(safeName.charAt(safeName.length - 3)) || 0 : 0; // Robust floor calc from 2nd digit or last few

      const newRoom = await client.query(
        'INSERT INTO rooms (name, building, floor, capacity) VALUES ($1, $2, $3, $4) RETURNING id',
        [safeName, building, floor, 40]
      );
      roomId = newRoom.rows[0].id;
    } else {
      roomId = roomRes.rows[0].id;
    }

    // 2. Construct times
    const startTime = new Date(date);
    startTime.setHours(parseInt(slot), 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    // 3. Create booking (reuse service logic for conflict checks)
    const result = await bookingService.createBooking(client, { 
      room_id: roomId, 
      start_time: startTime.toISOString(), 
      end_time: endTime.toISOString(), 
      purpose: purpose || 'Admin Quick Booking' 
    }, userId);

    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    logger.info('Admin Quick Booking created', { booking_id: result.data.id, room_name, start_time: startTime });
    res.status(201).json(result.data);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Quick book error:', err);
    res.status(500).json({ error: 'Quick booking failed' });
  } finally {
    client.release();
  }
};

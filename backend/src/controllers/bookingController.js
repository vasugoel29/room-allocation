import * as db from '../db.js';
import logger from '../utils/logger.js';
import * as bookingService from '../services/bookingService.js';
import cache from '../utils/cache.js';

export const getBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getBookings(req.query);
    res.json(bookings);
  } catch (err) {
    logger.error('Failed to fetch bookings', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

export const createBooking = async (req, res) => {
  const { room_id, start_time, end_time, purpose, faculty_id } = req.body;
  const userId = req.user.id;
  const startTimeObj = new Date(start_time);
  
  if (startTimeObj < new Date()) return res.status(400).json({ error: 'Cannot book in the past' });
  
  const daysDiff = Math.abs(startTimeObj - new Date()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 7 && req.user.role !== 'admin') {
    return res.status(400).json({ error: 'Regular bookings allowed only for the current week' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.createBooking(client, { 
      room_id, 
      start_time, 
      end_time, 
      purpose, 
      faculty_id,
      reschedule_room_name: req.body.reschedule_room_name, 
      reschedule_day: req.body.reschedule_day, 
      reschedule_hour: req.body.reschedule_hour 
    }, userId);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*'); 
    logger.info('Booking created', { booking_id: result.data.id, user_id: userId, room_id, start_time });
    res.status(201).json(result.data);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Booking creation failed', err);
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
};

export const cancelBooking = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.cancelBooking(client, id, userId, isAdmin);

    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*'); 
    logger.info('Booking cancelled', { booking_id: id, user_id: userId });
    res.json({ status: 'Success', message: 'Booking cancelled' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Cancellation failed', err);
    res.status(500).json({ error: 'Cancellation failed' });
  } finally {
    client.release();
  }
};

export const rescheduleBooking = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.rescheduleBooking(client, id, req.body, userId);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*');
    res.json(result.data);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Rescheduling failed', err);
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
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    let roomRes = await client.query('SELECT id FROM rooms WHERE UPPER(name) = UPPER($1)', [room_name]);
    let roomId;
    if (roomRes.rows.length === 0) {
      const safeName = String(room_name).trim();
      const firstDigit = safeName.charAt(0);
      const building = /^\d$/.test(firstDigit) ? `${firstDigit}th Block` : 'Unknown';
      const floor = safeName.length >= 2 ? parseInt(safeName.charAt(1)) || 0 : 0;

      const newRoom = await client.query(
        'INSERT INTO rooms (name, building, floor, capacity) VALUES ($1, $2, $3, $4) RETURNING id',
        [safeName, building, floor, 40]
      );
      roomId = newRoom.rows[0].id;
    } else {
      roomId = roomRes.rows[0].id;
    }

    const startTime = new Date(date);
    startTime.setHours(parseInt(slot), 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

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
    cache.deletePattern('admin_status_.*');
    logger.info('Admin Quick Booking created', { booking_id: result.data.id, room_name, start_time: startTime });
    res.status(201).json(result.data);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Quick book error:', err);
    res.status(500).json({ error: 'Quick booking failed' });
  } finally {
    client.release();
  }
};

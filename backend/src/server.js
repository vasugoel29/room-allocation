import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as db from './db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Modular Imports
import logger from './utils/logger.js';
import { authenticate, requireRole, JWT_SECRET } from './middleware/auth.js';
import * as bookingService from './services/bookingService.js';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 4000;

app.get('/', (req, res) => res.json({ status: 'ok', version: '1.2 (Refactored)' }));

// Lightweight health check endpoint with database verification
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('Health check failed (DB):', err);
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// --- Auth Routes ---
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
      [name, email, hash, role || 'VIEWER']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// --- Room Routes ---
app.get('/api/rooms', async (req, res) => {
  const { capacity, ac, projector } = req.query;
  let query = 'SELECT * FROM rooms WHERE 1=1';
  const params = [];

  if (capacity) { params.push(capacity); query += ` AND capacity >= $${params.length}`; }
  if (ac === 'true') query += ' AND has_ac = TRUE';
  if (projector === 'true') query += ' AND has_projector = TRUE';

  try {
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

app.get('/api/availability', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM room_availability');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// --- Booking Routes ---
app.get('/api/bookings', async (req, res) => {
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
});

app.post('/api/bookings', authenticate, requireRole('STUDENT_REP'), async (req, res) => {
  const { room_id, start_time, end_time, purpose, is_semester = false } = req.body;
  const userId = req.user.id;
  const startTimeObj = new Date(start_time);
  
  if (startTimeObj < new Date()) return res.status(400).json({ error: 'Cannot book in the past' });
  
  if (Math.abs(startTimeObj - new Date()) / (1000 * 60 * 60 * 24) > 7 && !is_semester) {
    return res.status(400).json({ error: 'Regular bookings allowed only for the current week' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.createBooking(client, { room_id, start_time, end_time, purpose, is_semester }, userId);
    
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
});

app.post('/api/bookings/semester', authenticate, requireRole('STUDENT_REP'), async (req, res) => {
  const { room_id, start_time, end_time, purpose } = req.body;
  const userId = req.user.id;
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.createSemesterBooking(client, { room_id, start_time, end_time, purpose }, userId);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    logger.info('Semester booking created', { user_id: userId, room_id, start_time });
    res.status(201).json(result.data);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Semester booking failed' });
  } finally {
    client.release();
  }
});

app.patch('/api/bookings/:id/cancel', authenticate, async (req, res) => {
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
});

app.patch('/api/bookings/:id', authenticate, requireRole('STUDENT_REP'), async (req, res) => {
  const { id } = req.params;
  const { start_time, end_time, room_id } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (current.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }

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
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', err);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'test') { 
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  }).on('error', (err) => {
    console.error('Server failed to start:', err);
  });
}


export default app;

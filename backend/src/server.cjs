const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const db = require('./db.cjs');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 4000;
const JWT_SECRET = 'your_jwt_secret';

// Structured Logger
const logger = {
  info: (action, data) => console.log(JSON.stringify({ timestamp: new Date(), level: 'INFO', action, ...data })),
  error: (action, error, data) => console.error(JSON.stringify({ timestamp: new Date(), level: 'ERROR', action, error: error.message, ...data })),
  warn: (action, data) => console.warn(JSON.stringify({ timestamp: new Date(), level: 'WARN', action, ...data }))
};

app.get('/', (req, res) => res.json({ status: 'ok', version: '1.1' }));

// Middleware to check JWT and role
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role && req.user.role !== 'STUDENT_REP') { // STUDENT_REP handles everything for now
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

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
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
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

  if (capacity) {
    params.push(capacity);
    query += ` AND capacity >= $${params.length}`;
  }
  if (ac === 'true') {
    query += ' AND has_ac = TRUE';
  }
  if (projector === 'true') {
    query += ' AND has_projector = TRUE';
  }

  try {
    console.log('Fetching rooms with query:', query, 'params:', params);
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Room fetch error:', err);
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

  if (room_id) {
    params.push(room_id);
    query += ` AND b.room_id = $${params.length}`;
  }
  if (user_id) {
    params.push(user_id);
    query += ` AND b.created_by = $${params.length}`;
  }
  if (start_date) {
    params.push(start_date);
    query += ` AND b.start_time >= $${params.length}`;
  }
  if (end_date) {
    params.push(end_date);
    query += ` AND b.end_time <= $${params.length}`;
  }
  if (slot) {
    // We'll assume slot is the hour
    params.push(slot);
    query += ` AND EXTRACT(HOUR FROM b.start_time) = $${params.length}`;
  }

  query += " ORDER BY b.created_at DESC";

  try {
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    logger.error('Fetch bookings failed', err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/bookings', authenticate, requireRole('STUDENT_REP'), async (req, res) => {
  const { room_id, start_time, end_time, purpose, is_semester = false } = req.body;
  const userId = req.user.id;
  const startTimeObj = new Date(start_time);
  
  // 1. No backdated booking
  if (startTimeObj < new Date()) {
    logger.warn('Booking rejected: Backdated', { user_id: userId, start_time });
    return res.status(400).json({ error: 'Cannot book in the past' });
  }

  // 2. Booking allowed only for current week (Phase 2 requirement 4)
  // We'll define current week as next 7 days or current calendar week? 
  // Let's stick to "allowed only for current week" literally if possible, 
  // but usually it means within next 7 days.
  const now = new Date();
  const weekDiff = Math.abs(startTimeObj - now) / (1000 * 60 * 60 * 24);
  if (weekDiff > 7 && !is_semester) {
    logger.warn('Booking rejected: Outside current week', { user_id: userId, start_time });
    return res.status(400).json({ error: 'Regular bookings allowed only for the current week' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check Room conflict
    const roomConflict = await client.query(
      `SELECT * FROM bookings 
       WHERE room_id = $1 AND status = 'ACTIVE' 
       AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [room_id, start_time, end_time]
    );

    if (roomConflict.rows.length > 0) {
      logger.info('Conflict: Room occupied', { room_id, start_time, user_id: userId });
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Room is already booked for this time period' });
    }

    // Check User conflict (One user -> one room per slot)
    const userConflict = await client.query(
      `SELECT * FROM bookings 
       WHERE created_by = $1 AND status = 'ACTIVE' 
       AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [userId, start_time, end_time]
    );

    if (userConflict.rows.length > 0) {
      logger.info('Conflict: User busy', { user_id: userId, start_time });
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You already have another booking during this time' });
    }

    const query = 'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, is_semester_booking) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *';
    const values = [room_id, start_time, end_time, userId, purpose, is_semester];
    console.log('Executing query:', query, 'with values:', values);
    const insertResult = await client.query(query, values);

    await client.query('COMMIT');
    logger.info('Booking created', { booking_id: insertResult.rows[0].id, user_id: userId, room_id, start_time });
    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    logger.error('Booking failed', err, { user_id: userId, room_id, start_time });
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database error' });
  } finally {
    client.release();
  }
});

// Semester Booking Route (Atomic)
app.post('/api/bookings/semester', authenticate, requireRole('STUDENT_REP'), async (req, res) => {
  const { room_id, start_time, end_time, purpose } = req.body;
  const userId = req.user.id;
  const weeks = 15; // Semester duration
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
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
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `Conflict at week ${i+1}. Semester booking failed.` });
        }

        // Check User conflict
        const userConflict = await client.query(
          `SELECT * FROM bookings 
           WHERE created_by = $1 AND status = 'ACTIVE' 
           AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
          [userId, currentStart.toISOString(), currentEnd.toISOString()]
        );

        if (userConflict.rows.length > 0) {
          logger.info('Semester Conflict: User busy', { user_id: userId, week: i, start_time: currentStart.toISOString() });
          await client.query('ROLLBACK');
          return res.status(409).json({ error: `User busy at week ${i+1}. Semester booking failed.` });
        }

        await client.query(
          'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose, is_semester_booking) VALUES ($1, $2, $3, $4, $5, TRUE)',
          [room_id, currentStart.toISOString(), currentEnd.toISOString(), userId, purpose]
        );
    }

    await client.query('COMMIT');
    logger.info('Semester booking created', { user_id: userId, room_id, start_time });
    res.status(201).json({ status: 'Success', message: 'Semester booking confirmed for 15 weeks' });
  } catch (err) {
    logger.error('Semester booking failed', err, { user_id: userId, room_id, start_time });
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Semester booking failed: ' + err.message });
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

    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.created_by !== userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the owner can cancel this booking' });
    }

    await client.query(
      "UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    logger.info('Booking cancelled', { booking_id: id, user_id: userId, room_id: booking.room_id });
    res.json({ status: 'Success', message: 'Booking cancelled' });
  } catch (err) {
    logger.error('Cancellation failed', err, { booking_id: id, user_id: userId });
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
    if (current.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Log history
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

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;


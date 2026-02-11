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
    res.json({ token, user: { email: user.email, role: user.role, name: user.name } });
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
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// --- Booking Routes ---
app.get('/api/bookings', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT b.*, r.name as room_name, u.name as user_name 
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.created_by = u.id
      WHERE b.status = 'ACTIVE'
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

app.post('/api/bookings', authenticate, requireRole('STUDENT_REP'), async (req, res) => {
  const { room_id, start_time, end_time, purpose } = req.body;
  console.log(`Booking attempt: Room ${room_id}, ${start_time} - ${end_time} by ${req.user.email} (${req.user.role})`);
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const checkResult = await client.query(
      `SELECT * FROM bookings 
       WHERE room_id = $1 AND status = 'ACTIVE' 
       AND tstzrange(start_time, end_time) && tstzrange($2::timestamptz, $3::timestamptz)`,
      [room_id, start_time, end_time]
    );

    if (checkResult.rows.length > 0) {
      console.log('Conflict detected');
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Room is already booked for this time period' });
    }

    const insertResult = await client.query(
      'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [room_id, start_time, end_time, req.user.id, purpose]
    );

    await client.query('COMMIT');
    console.log('Booking created:', insertResult.rows[0].id);
    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error('Booking DB error:', err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Database error: ' + err.message });
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


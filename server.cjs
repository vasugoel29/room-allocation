const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const dbRooms = require('./db-rooms.cjs');
const db = require('./db.cjs');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors()); // Allow all origins

// Simple debug logger
function log(...args) {
  console.log('[DEBUG]', ...args);
}
const PORT = 4000;
const JWT_SECRET = 'your_jwt_secret'; // Change this in production

app.use(bodyParser.json());
app.use((req, res, next) => {
  log('Request:', req.method, req.url, 'Body:', req.body);
  next();
});

// Middleware to check admin JWT
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.email !== 'Admin@nsut.ac.in') {
      log('Forbidden: Admins only', decoded);
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    log('JWT error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// List all users (admin only)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT email FROM users ORDER BY email');
    log('Admin users:', result.rows);
    res.json({ users: result.rows });
  } catch (err) {
    log('Error /admin/users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a user (admin only, cannot delete self)
app.delete('/admin/users/:email', requireAdmin, async (req, res) => {
  const email = req.params.email;
  if (email === 'Admin@nsut.ac.in') {
    return res.status(403).json({ error: 'Cannot delete admin user' });
  }
  try {
    await db.query('DELETE FROM users WHERE email = $1', [email]);
    log('Deleted user:', email);
    res.json({ success: true });
  } catch (err) {
    log('Error deleting user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// /register route (admin can register any user)
app.post('/register', async (req, res) => {
  const { adminEmail, adminPassword, email, password, branch, year, section } = req.body;
  if (!adminEmail || !adminPassword || !email || !password || !branch || !year || !section) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (adminEmail !== 'Admin@nsut.ac.in') {
    return res.status(403).json({ error: 'Forbidden: Only admin can register new users' });
  }
  try {
    // Authenticate admin
    const result = await db.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    const adminUser = result.rows[0];
    log('Admin login attempt:', adminEmail, !!adminUser);
    if (!adminUser) {
      return res.status(403).json({ error: 'Forbidden: Admin not found' });
    }
    const match = await bcrypt.compare(adminPassword, adminUser.password);
    log('Admin password match:', match);
    if (!match) {
      return res.status(403).json({ error: 'Forbidden: Invalid admin credentials' });
    }
    // Register new user as student
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (email, password, role, branch, year, section) VALUES ($1, $2, $3, $4, $5, $6)',
      [email, hash, 'student', branch, year, section]
    );
    log('Registered new user:', email);
    res.json({ success: true });
  } catch (err) {
    log('Error /register:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// /login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    log('Login attempt:', email, !!user);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Compare hashed password
    const match = await bcrypt.compare(password, user.password);
    log('Password match:', match);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    log('JWT issued for:', email);
    res.json({ token });
  } catch (err) {
    log('Error /login:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// --- Available Rooms ---
// GET /available-rooms?day=Mon&slot=09:00-10:00
app.get('/available-rooms', async (req, res) => {
  const { day, slot } = req.query;
  if (!day || !slot) {
    return res.status(400).json({ error: 'day and slot required' });
  }
  const days = await dbRooms.getDays();
  const slots = await dbRooms.getSlots();
  if (!days.includes(day)) {
    return res.status(400).json({ error: 'Invalid day' });
  }
  if (!slots.includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot' });
  }
  const available = await dbRooms.getAvailability(day, slot);
  const rooms = await dbRooms.getRooms();
  const result = available.map(roomId => ({
    roomId,
    features: rooms[roomId]?.features || []
  }));
  log('Available rooms:', { day, slot, result });
  res.json(result);
});

// GET /available-rooms/all
app.get('/available-rooms/all', async (req, res) => {
  const days = await dbRooms.getDays();
  const slots = await dbRooms.getSlots();
  const rooms = await dbRooms.getRooms();
  const result = {};
  for (const day of days) {
    result[day] = {};
    for (const slot of slots) {
      const available = await dbRooms.getAvailability(day, slot);
      result[day][slot] = available.map(roomId => ({
        roomId,
        features: rooms[roomId]?.features || []
      }));
    }
  }
  log('All weekly availability:', result);
  res.json(result);
});

// --- Book a Room ---
// POST /book-room
app.post('/book-room', async (req, res) => {
  const { date, slot, roomId } = req.body;
  if (!date || !slot || !roomId) {
    return res.status(400).json({ error: 'date, slot, roomId required' });
  }
  // Validate slot, roomId
  const days = await dbRooms.getDays();
  const slots = await dbRooms.getSlots();
  const rooms = await dbRooms.getRooms();
  // Determine day from date (YYYY-MM-DD)
  const jsDate = new Date(date);
  if (isNaN(jsDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  const day = dbRooms.getDayFromDate(date);
  if (!days.includes(day)) {
    return res.status(400).json({ error: 'Date not in allowed days' });
  }
  if (!slots.includes(slot)) {
    return res.status(400).json({ error: 'Invalid slot' });
  }
  if (!rooms[roomId]) {
    return res.status(400).json({ error: 'Invalid roomId' });
  }
  const available = await dbRooms.getAvailability(day, slot);
  if (!available.includes(roomId)) {
    return res.status(400).json({ error: 'Room not available for this day/slot' });
  }
  // Atomic update: add booking, remove room from availability
  try {
    const booking = await dbRooms.addBooking({ date, slot, roomId });
    log('Booking created:', booking);
    res.status(201).json(booking);
  } catch (err) {
    log('Error /book-room:', err);
    res.status(500).json({ error: 'Booking failed' });
  }
});

// --- Get All Bookings ---
// GET /bookings
app.get('/bookings', async (req, res) => {
  const bookings = await dbRooms.getBookings();
  log('All bookings:', bookings);
  res.json(bookings);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const db = require('./db.cjs');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 4000;
const JWT_SECRET = 'your_jwt_secret'; // Change this in production

app.use(bodyParser.json());

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
      return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// List all users (admin only)
app.get('/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT email FROM users ORDER BY email');
    res.json({ users: result.rows });
  } catch (err) {
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
    res.json({ success: true });
  } catch (err) {
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
    if (!adminUser) {
      return res.status(403).json({ error: 'Forbidden: Admin not found' });
    }
    const match = await bcrypt.compare(adminPassword, adminUser.password);
    if (!match) {
      return res.status(403).json({ error: 'Forbidden: Invalid admin credentials' });
    }
    // Register new user as student
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (email, password, role, branch, year, section) VALUES ($1, $2, $3, $4, $5, $6)',
      [email, hash, 'student', branch, year, section]
    );
    res.json({ success: true });
  } catch (err) {
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
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Compare hashed password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

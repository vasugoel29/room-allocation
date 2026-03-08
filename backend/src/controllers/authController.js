import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as db from '../db.js';
import nodemailer from 'nodemailer';
import { JWT_SECRET } from '../middleware/auth.js';

export const signup = async (req, res) => {
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
};

export const login = async (req, res) => {
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
};

export const forgotPassword = async (req, res) => {
  const { loginEmail, recoveryEmail } = req.body;

  if (!loginEmail || !recoveryEmail) {
    return res.status(400).json({ error: 'Both login and recovery emails are required' });
  }

  // Create transporter (using Gmail as a likely candidate, but using generic SMTP settings)
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const mailOptions = {
    from: process.env.SMTP_USER,
    to: 'support.cras.nsut@gmail.com',
    subject: `request for password for ${loginEmail} along with ${recoveryEmail}`,
    text: `Password recovery request:\n\nLogin Email: ${loginEmail}\nRecovery Email: ${recoveryEmail}\n\nPlease share the password with the recovery email address provided.`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: 'Password recovery request sent successfully' });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Failed to send recovery request' });
  }
};

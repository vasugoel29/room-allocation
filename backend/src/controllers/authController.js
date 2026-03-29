import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import * as userService from '../services/userService.js';
import { JWT_SECRET } from '../middleware/auth.js';
import * as db from '../db.js';
import logger from '../utils/logger.js';
import { ensureDepartment } from './departmentController.js';

export const signup = async (req, res) => {
  const { name, email, password, branch, year, section, role, departmentName } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    
    // Resolve department_id if name provided
    let department_id = null;
    if (departmentName) {
      department_id = await ensureDepartment(departmentName);
    }

    // Faculty requires approval
    const is_approved = role === 'FACULTY' ? false : true;

    const user = await userService.createUser({
      name, 
      email, 
      passwordHash: hash, 
      role: role || 'VIEWER',
      branch, 
      year, 
      section,
      department_id,
      is_approved
    });
    
    res.status(201).json({
      ...user,
      message: role === 'FACULTY' ? 'Account created! Awaiting administrator approval.' : 'Account created successfully.'
    });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    logger.error('Signup failed', err);
    res.status(500).json({ error: 'Signup failed' });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await userService.findByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.is_approved === false) {
      return res.status(403).json({ error: 'Your account is awaiting administrator approval.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ 
      message: 'Logged in successfully', 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        name: user.name,
        branch: user.branch,
        year: user.year,
        section: user.section,
        department_name: user.department_name
      } 
    });
  } catch (err) {
    logger.error('Login failed', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const logout = (req, res) => {
  res.json({ message: 'Logged out successfully' });
};

export const getUsers = async (req, res) => {
  try {
    const users = await userService.getUsers();
    res.json(users);
  } catch (err) {
    logger.error('Failed to fetch users', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const approveUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await userService.updateUser(id, { is_approved: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User approved successfully', user });
  } catch (err) {
    logger.error('Failed to approve user', err);
    res.status(500).json({ error: 'Failed to approve user' });
  }
};

export const createUser = async (req, res) => {
  const { name, email, password, role, branch, year, section, departmentName } = req.body;
  try {
    const hash = await bcrypt.hash(password || 'password123', 10);
    
    let department_id = null;
    if (departmentName) {
      department_id = await ensureDepartment(departmentName);
    }

    const user = await userService.createUser({
      name, email, passwordHash: hash, role: role || 'VIEWER', branch, year, section, department_id, is_approved: true
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    logger.error('Failed to create user', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { departmentName, ...otherData } = req.body;
  try {
    let department_id = undefined;
    if (departmentName) {
      department_id = await ensureDepartment(departmentName);
    }
    
    const user = await userService.updateUser(id, { ...otherData, department_id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    logger.error('Failed to update user', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await userService.deleteUser(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    logger.error('Failed to delete user', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export const getFaculties = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT u.id, u.name, u.email, d.name as department 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      WHERE u.role = 'FACULTY' AND u.is_approved = true
      ORDER BY u.name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch faculties' });
  }
};

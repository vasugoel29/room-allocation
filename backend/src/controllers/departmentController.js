import * as db from '../db.js';
import logger from '../utils/logger.js';

export const getDepartments = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM departments ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    logger.error('Failed to fetch departments', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};

export const createDepartment = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required' });

  try {
    const result = await db.query(
      'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('Failed to create department', err);
    res.status(500).json({ error: 'Failed to create department' });
  }
};

/**
 * Helper to get or create a department by name
 */
export const ensureDepartment = async (name) => {
  if (!name) return null;
  const result = await db.query(
    'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
    [name]
  );
  return result.rows[0].id;
};

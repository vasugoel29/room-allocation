import * as departmentService from '../services/departmentService.js';
import logger from '../utils/logger.js';

export const getDepartments = async (req, res) => {
  try {
    const departments = await departmentService.getDepartments();
    res.json(departments);
  } catch (err) {
    logger.error('Failed to fetch departments', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};

export const createDepartment = async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required' });

  try {
    const department = await departmentService.createDepartment(name);
    res.status(201).json(department);
  } catch (err) {
    logger.error('Failed to create department', err);
    res.status(500).json({ error: 'Failed to create department' });
  }
};

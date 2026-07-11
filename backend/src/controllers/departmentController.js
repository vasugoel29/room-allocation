import * as departmentService from '../services/departmentService.js';
import logger from '../utils/logger.js';

export const getDepartments = async (req, res) => {
  try {
    const result = await departmentService.getDepartments(req.query);
    res.json(result);
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

export const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Department name is required' });

  try {
    const department = await departmentService.updateDepartment(id, name);
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json(department);
  } catch (err) {
    logger.error('Failed to update department', err);
    res.status(500).json({ error: 'Failed to update department' });
  }
};

export const deleteDepartment = async (req, res) => {
  const { id } = req.params;
  try {
    const department = await departmentService.deleteDepartment(id);
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }
    res.json({ status: 'Success', message: `Department ${department.name} deleted successfully` });
  } catch (err) {
    logger.error('Failed to delete department', err);
    res.status(500).json({ error: 'Failed to delete department' });
  }
};

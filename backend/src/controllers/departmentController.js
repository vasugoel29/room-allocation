import * as departmentService from '../services/departmentService.js';
import logger from '../utils/logger.js';
import { sendError, sendServerError } from '../utils/httpErrors.js';

export const getDepartments = async (req, res) => {
  try {
    const result = await departmentService.getDepartments(req.query);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch departments', err);
    sendServerError(res, err, 'Failed to fetch departments');
  }
};

export const createDepartment = async (req, res) => {
  const { name } = req.body;
  if (!name) return sendError(res, 400, 'Department name is required');

  try {
    const department = await departmentService.createDepartment(name);
    res.status(201).json(department);
  } catch (err) {
    logger.error('Failed to create department', err);
    sendServerError(res, err, 'Failed to create department');
  }
};

export const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return sendError(res, 400, 'Department name is required');

  try {
    const department = await departmentService.updateDepartment(id, name);
    if (!department) {
      return sendError(res, 404, 'Department not found');
    }
    res.json(department);
  } catch (err) {
    logger.error('Failed to update department', err);
    sendServerError(res, err, 'Failed to update department');
  }
};

export const deleteDepartment = async (req, res) => {
  const { id } = req.params;
  try {
    const department = await departmentService.deleteDepartment(id);
    if (!department) {
      return sendError(res, 404, 'Department not found');
    }
    res.json({ status: 'Success', message: `Department ${department.name} deleted successfully` });
  } catch (err) {
    logger.error('Failed to delete department', err);
    sendServerError(res, err, 'Failed to delete department');
  }
};

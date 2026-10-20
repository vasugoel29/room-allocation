import * as departmentService from '../services/departmentService.js';
import logger from '../utils/logger.js';
import { sendServerError } from '../utils/httpErrors.js';

export const getDepartments = async (req, res) => {
  try {
    const result = await departmentService.getDepartments(req.query);
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch departments', err);
    sendServerError(res, err, 'Failed to fetch departments');
  }
};

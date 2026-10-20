import * as branchService from '../services/branchService.js';
import logger from '../utils/logger.js';
import { sendServerError } from '../utils/httpErrors.js';

export const getBranches = async (req, res) => {
  try {
    res.json(await branchService.getBranches(req.query));
  } catch (err) {
    logger.error('Failed to fetch branches', err);
    sendServerError(res, err, 'Failed to fetch branches');
  }
};

import * as branchService from '../services/branchService.js';
import logger from '../utils/logger.js';
import { sendError, sendServerError } from '../utils/httpErrors.js';

const parseBranch = ({ name, short_code, department_id }) => ({
  name: name?.trim(),
  short_code: short_code?.trim().toUpperCase() || null,
  department_id: Number.parseInt(department_id, 10) || null
});

export const getBranches = async (req, res) => {
  try {
    res.json(await branchService.getBranches(req.query));
  } catch (err) {
    logger.error('Failed to fetch branches', err);
    sendServerError(res, err, 'Failed to fetch branches');
  }
};

export const createBranch = async (req, res) => {
  const branch = parseBranch(req.body);
  if (!branch.name) return sendError(res, 400, 'Branch name is required');
  try {
    res.status(201).json(await branchService.createBranch(branch));
  } catch (err) {
    logger.error('Failed to create branch', err);
    sendServerError(res, err, 'Failed to create branch');
  }
};

export const updateBranch = async (req, res) => {
  const branch = parseBranch(req.body);
  if (!branch.name) return sendError(res, 400, 'Branch name is required');
  try {
    const updatedBranch = await branchService.updateBranch(req.params.id, branch);
    if (!updatedBranch) return sendError(res, 404, 'Branch not found');
    res.json(updatedBranch);
  } catch (err) {
    logger.error('Failed to update branch', err);
    sendServerError(res, err, 'Failed to update branch');
  }
};

export const deleteBranch = async (req, res) => {
  try {
    const branch = await branchService.deleteBranch(req.params.id);
    if (!branch) return sendError(res, 404, 'Branch not found');
    res.json({ status: 'Success', message: `Branch ${branch.name} deleted successfully` });
  } catch (err) {
    logger.error('Failed to delete branch', err);
    sendServerError(res, err, 'Failed to delete branch');
  }
};

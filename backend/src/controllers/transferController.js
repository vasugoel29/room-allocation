import { sendServerError } from '../utils/httpErrors.js';
import logger from '../utils/logger.js';
import * as transferService from '../services/transferService.js';

export const requestTransfer = async (req, res) => {
  try {
    const result = await transferService.requestTransfer(req.body, req.user.id, req.user.role);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.status(201).json({ message: 'Transfer request sent', transfer: result.data });
  } catch (err) {
    logger.error('Failed to request transfer', err);
    sendServerError(res, err, 'Failed to request transfer');
  }
};

export const getIncomingRequests = async (req, res) => {
  try {
    const requests = await transferService.getIncomingRequests(req.user.id, req.user.faculty_id);
    res.json(requests);
  } catch (err) {
    logger.error('Failed to fetch incoming transfers', err);
    sendServerError(res, err, 'Failed to fetch incoming transfers');
  }
};

export const getOutgoingRequests = async (req, res) => {
  try {
    const requests = await transferService.getOutgoingRequests(req.user.id);
    res.json(requests);
  } catch (err) {
    logger.error('Failed to fetch outgoing transfers', err);
    sendServerError(res, err, 'Failed to fetch outgoing transfers');
  }
};

export const acceptTransfer = async (req, res) => {
  try {
    const result = await transferService.acceptTransfer(req.params.id, req.user.id, req.user.role, req.user.faculty_id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: result.message });
  } catch (err) {
    logger.error('Failed to accept transfer', err);
    sendServerError(res, err, 'Failed to accept transfer');
  }
};

export const rejectTransfer = async (req, res) => {
  try {
    const result = await transferService.rejectTransfer(req.params.id, req.user.id, req.user.role, req.user.faculty_id);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json({ message: result.message });
  } catch (err) {
    logger.error('Failed to reject transfer', err);
    sendServerError(res, err, 'Failed to reject transfer');
  }
};

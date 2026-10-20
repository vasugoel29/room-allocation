import { sendServerError } from '../utils/httpErrors.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import * as bookingService from '../services/bookingService.js';

export const getPendingRequests = async (req, res) => {
  // Requests are addressed to the faculty-directory entry linked to this account.
  const facultyId = req.user.faculty_id;
  try {
    const requests = facultyId ? await bookingService.getPendingFacultyRequests(facultyId) : [];
    res.json(requests);
  } catch (err) {
    logger.error('Failed to fetch pending requests', err);
    sendServerError(res, err, 'Failed to fetch pending requests');
  }
};

export const approveBooking = async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'ADMIN';
  
  const result = await bookingService.inTransaction((client) => bookingService.approveBooking(client, id, req.user, isAdmin));

  if (result.error) {
    return res.status(result.status).json({ error: result.error, ...(result.conflict ? { conflict: result.conflict } : {}) });
  }

  cache.deletePattern('admin_status_.*');

  // The student is notified inside the approval transaction (notifications outbox).
  res.json({ message: 'Booking approved', booking: result.data });
};

export const rejectBooking = async (req, res) => {
  const { id } = req.params;
  const isAdmin = req.user.role === 'ADMIN';
  
  try {
    const result = await bookingService.rejectBooking(id, req.user, isAdmin);
    if (result.error) return res.status(result.status).json({ error: result.error });

    res.json({ message: 'Booking rejected' });
  } catch (err) {
    logger.error('Failed to reject booking', err);
    sendServerError(res, err, 'Failed to reject booking');
  }
};

import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import * as bookingService from '../services/bookingService.js';

export const getPendingRequests = async (req, res) => {
  const facultyId = req.user.id;
  try {
    const requests = await bookingService.getPendingFacultyRequests(facultyId);
    res.json(requests);
  } catch (err) {
    logger.error('Failed to fetch pending requests', err);
    res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
};

export const approveBooking = async (req, res) => {
  const { id } = req.params;
  const facultyId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await bookingService.approveBooking(client, id, facultyId, isAdmin);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return res.status(result.status).json({ error: result.error });
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*');
    res.json({ message: 'Booking approved', booking: result.data });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to approve booking:', err);
    res.status(500).json({ error: 'Failed to approve booking' });
  } finally {
    client.release();
  }
};

export const rejectBooking = async (req, res) => {
  const { id } = req.params;
  const facultyId = req.user.id;
  const isAdmin = req.user.role === 'admin';
  
  try {
    const result = await bookingService.rejectBooking(id, facultyId, isAdmin);
    if (result.error) return res.status(result.status).json({ error: result.error });
    res.json({ message: 'Booking rejected' });
  } catch (err) {
    logger.error('Failed to reject booking', err);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
};

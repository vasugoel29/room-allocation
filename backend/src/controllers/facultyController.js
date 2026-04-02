import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import * as bookingService from '../services/bookingService.js';
import { userRepository } from '../repositories/userRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { notifyStudentBookingStatus } from '../utils/emailService.js';

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
  const isAdmin = req.user.role === 'ADMIN';
  
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

    // PROD-02: Notify student their booking was approved
    try {
      const fullBooking = await bookingRepository.findById(id);
      if (fullBooking) {
        const student = await userRepository.findById(fullBooking.created_by);
        const room = await roomRepository.findById(fullBooking.room_id);
        if (student?.email) {
          const dateStr = new Date(fullBooking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const hour = new Date(fullBooking.start_time).getHours();
          notifyStudentBookingStatus({
            studentEmail: student.email,
            studentName: student.name,
            roomName: room?.name || fullBooking.room_id,
            date: dateStr,
            time: `${hour}:00 – ${hour + 1}:00`,
            status: 'APPROVED'
          }).catch(err => logger.error('Approval notification failed', err));
        }
      }
    } catch (notifErr) {
      logger.error('Failed to send approval notification (non-blocking)', notifErr);
    }

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
  const isAdmin = req.user.role === 'ADMIN';
  
  try {
    const result = await bookingService.rejectBooking(id, facultyId, isAdmin);
    if (result.error) return res.status(result.status).json({ error: result.error });

    // PROD-02: Notify student their booking was rejected
    try {
      const fullBooking = await bookingRepository.findById(id);
      if (fullBooking) {
        const student = await userRepository.findById(fullBooking.created_by);
        const room = await roomRepository.findById(fullBooking.room_id);
        if (student?.email) {
          const dateStr = new Date(fullBooking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const hour = new Date(fullBooking.start_time).getHours();
          notifyStudentBookingStatus({
            studentEmail: student.email,
            studentName: student.name,
            roomName: room?.name || fullBooking.room_id,
            date: dateStr,
            time: `${hour}:00 – ${hour + 1}:00`,
            status: 'REJECTED'
          }).catch(err => logger.error('Rejection notification failed', err));
        }
      }
    } catch (notifErr) {
      logger.error('Failed to send rejection notification (non-blocking)', notifErr);
    }

    res.json({ message: 'Booking rejected' });
  } catch (err) {
    logger.error('Failed to reject booking', err);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
};

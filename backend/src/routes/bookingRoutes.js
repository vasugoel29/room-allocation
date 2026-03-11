import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { 
  getBookings, 
  createBooking, 
  cancelBooking, 
  rescheduleBooking,
  quickBook
} from '../controllers/bookingController.js';

const router = express.Router();

router.get('/', getBookings);
router.post('/', authenticate, requireRole('STUDENT_REP'), createBooking);
router.patch('/:id/cancel', authenticate, cancelBooking);
router.patch('/:id', authenticate, requireRole('STUDENT_REP'), rescheduleBooking);

// Admin-only all bookings (active & cancelled)
router.get('/admin/all', authenticate, requireRole('admin'), getBookings);
router.post('/admin/quick', authenticate, requireRole('admin'), quickBook);

export default router;

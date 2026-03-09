import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { 
  getBookings, 
  createBooking, 
  cancelBooking, 
  rescheduleBooking 
} from '../controllers/bookingController.js';

const router = express.Router();

router.get('/', getBookings);
router.post('/', authenticate, requireRole('STUDENT_REP'), createBooking);
router.patch('/:id/cancel', authenticate, cancelBooking);
router.patch('/:id', authenticate, requireRole('STUDENT_REP'), rescheduleBooking);

export default router;

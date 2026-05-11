import express from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { 
  getBookings, 
  createBooking, 
  cancelBooking, 
  rescheduleBooking,
  quickBook
} from '../controllers/bookingController.js';

const router = express.Router();

const bookingValidation = [
  body('room_id').isInt().withMessage('Valid room ID required'),
  body('start_time').isISO8601().withMessage('Valid start time required'),
  body('end_time').isISO8601().withMessage('Valid end time required'),
  body('purpose').trim().notEmpty().isLength({ max: 100 }).withMessage('Purpose must be between 1 and 100 characters')
];

const idValidation = [
  param('id').isInt().withMessage('Valid booking ID required')
];

const quickBookValidation = [
  body('room_name').trim().notEmpty().withMessage('Room name required'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('slot').isInt({ min: 0, max: 23 }).withMessage('Slot must be between 0 and 23')
];

router.get('/', authenticate, getBookings);
router.post('/', authenticate, requireRole('STUDENT_REP'), bookingValidation, validateRequest, createBooking);
router.patch('/:id/cancel', authenticate, idValidation, validateRequest, cancelBooking);
router.patch('/:id', authenticate, requireRole('STUDENT_REP'), idValidation, validateRequest, rescheduleBooking);

// Admin-only all bookings (active & cancelled)
router.get('/admin/all', authenticate, requireRole('ADMIN'), getBookings);
router.post('/admin/quick', authenticate, requireRole('ADMIN'), quickBookValidation, validateRequest, quickBook);

export default router;

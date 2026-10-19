import express from 'express';
import { body, param } from 'express-validator';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
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
router.post('/', authenticate, requirePermission(P.ROOMS_BOOK), bookingValidation, validateRequest, createBooking);
router.patch('/:id/cancel', authenticate, idValidation, validateRequest, cancelBooking);
router.patch('/:id', authenticate, requirePermission(P.ROOMS_BOOK), idValidation, validateRequest, rescheduleBooking);


// Admin-only all bookings (active & cancelled)
router.get('/admin/all', authenticate, requirePermission(P.BOOKINGS_MANAGE), getBookings);
router.post('/admin/quick', authenticate, requirePermission(P.BOOKINGS_MANAGE), quickBookValidation, validateRequest, quickBook);

export default router;

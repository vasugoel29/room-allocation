import express from 'express';
import { getPendingRequests, approveBooking, rejectBooking } from '../controllers/facultyController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireRole('FACULTY'));

router.get('/pending', getPendingRequests);
router.patch('/:id/approve', approveBooking);
router.patch('/:id/reject', rejectBooking);

export default router;

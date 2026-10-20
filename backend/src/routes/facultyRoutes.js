import express from 'express';
import { getPendingRequests, approveBooking, rejectBooking } from '../controllers/facultyController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { idParam } from '../middleware/validators.js';

const router = express.Router();
router.param('id', idParam);

router.use(authenticate);
router.use(requirePermission(P.FACULTY_PORTAL, P.ADMIN));

router.get('/pending', getPendingRequests);
router.patch('/:id/approve', approveBooking);
router.patch('/:id/reject', rejectBooking);

export default router;

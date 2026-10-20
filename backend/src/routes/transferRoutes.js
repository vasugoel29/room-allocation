import express from 'express';
import { requestTransfer, getIncomingRequests, getOutgoingRequests, acceptTransfer, rejectTransfer } from '../controllers/transferController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { idParam } from '../middleware/validators.js';

// Owners answer with cras.bookings, faculty in the chain with cras.faculty_portal.
const ANSWER = [P.BOOKINGS, P.FACULTY_PORTAL, P.ADMIN];
const router = express.Router();
router.param('id', idParam);

router.use(authenticate);

router.post('/request', requirePermission(P.BOOKINGS), requestTransfer);
router.get('/incoming', requirePermission(...ANSWER), getIncomingRequests);
router.get('/outgoing', requirePermission(...ANSWER), getOutgoingRequests);
router.patch('/:id/accept', requirePermission(...ANSWER), acceptTransfer);
router.patch('/:id/reject', requirePermission(...ANSWER), rejectTransfer);

export default router;

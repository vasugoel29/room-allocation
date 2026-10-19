import express from 'express';
import { requestTransfer, getIncomingRequests, getOutgoingRequests, acceptTransfer, rejectTransfer } from '../controllers/transferController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { idParam } from '../middleware/validators.js';

const router = express.Router();
router.param('id', idParam);

router.use(authenticate);

router.post('/request', requirePermission(P.BOOKINGS_TRANSFER), requestTransfer);
router.get('/incoming', getIncomingRequests);
router.get('/outgoing', getOutgoingRequests);
router.patch('/:id/accept', acceptTransfer);
router.patch('/:id/reject', rejectTransfer);

export default router;

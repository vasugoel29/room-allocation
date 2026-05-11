import express from 'express';
import { requestTransfer, getIncomingRequests, getOutgoingRequests, acceptTransfer, rejectTransfer } from '../controllers/transferController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.post('/request', requestTransfer);
router.get('/incoming', getIncomingRequests);
router.get('/outgoing', getOutgoingRequests);
router.patch('/:id/accept', acceptTransfer);
router.patch('/:id/reject', rejectTransfer);

export default router;

import express from 'express';
import { getRooms, getAvailability, getAdminRoomStatus, overrideRoomAvailability, getMyOverrides } from '../controllers/roomController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/rooms', authenticate, getRooms);
router.get('/availability', authenticate, getAvailability);
router.get('/availability/my', authenticate, getMyOverrides);
router.get('/rooms/admin/status', authenticate, requireRole('ADMIN'), getAdminRoomStatus);
router.post('/availability/override', authenticate, requireRole('STUDENT_REP'), overrideRoomAvailability);

export default router;

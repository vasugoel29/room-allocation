import express from 'express';
import { getRooms, getAvailability, getAdminRoomStatus, overrideRoomAvailability, getMyOverrides } from '../controllers/roomController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/rooms', getRooms);
router.get('/availability', getAvailability);
router.get('/availability/my', authenticate, getMyOverrides);
router.get('/rooms/admin/status', authenticate, requireRole('admin'), getAdminRoomStatus);
router.post('/availability/override', authenticate, overrideRoomAvailability);

export default router;

import express from 'express';
import { getRooms, getAvailability, getAdminRoomStatus } from '../controllers/roomController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/rooms', getRooms);
router.get('/availability', getAvailability);
router.get('/rooms/admin/status', authenticate, requireRole('admin'), getAdminRoomStatus);

export default router;

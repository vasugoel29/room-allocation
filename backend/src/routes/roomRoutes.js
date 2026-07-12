import express from 'express';
import { getRooms, getAvailability, getAdminRoomStatus, overrideRoomAvailability, getMyOverrides, createRoom, updateRoom, deleteRoom, getRoomWeekSchedule, checkRoomConflict } from '../controllers/roomController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/rooms', authenticate, getRooms);
router.post('/rooms', authenticate, requireRole('ADMIN'), createRoom);
router.patch('/rooms/:id', authenticate, requireRole('ADMIN'), updateRoom);
router.delete('/rooms/:id', authenticate, requireRole('ADMIN'), deleteRoom);
router.get('/availability', authenticate, getAvailability);
router.get('/availability/my', authenticate, getMyOverrides);
router.get('/rooms/admin/status', authenticate, requireRole('ADMIN'), getAdminRoomStatus);
router.post('/availability/override', authenticate, requireRole('STUDENT_REP'), overrideRoomAvailability);

// Room Schedule Grid Endpoints
router.get('/rooms/:id/week-schedule', authenticate, requireRole('ADMIN'), getRoomWeekSchedule);
router.get('/rooms/:id/conflict-check', authenticate, requireRole('ADMIN'), checkRoomConflict);

export default router;

import express from 'express';
import { getRooms, getAvailability, getAdminRoomStatus, overrideRoomAvailability, getMyOverrides, createRoom, updateRoom, deleteRoom, getRoomWeekSchedule, checkRoomConflict } from '../controllers/roomController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';

const router = express.Router();

router.get('/rooms', authenticate, getRooms);
router.post('/rooms', authenticate, requirePermission(P.ROOMS_MANAGE), createRoom);
router.patch('/rooms/:id', authenticate, requirePermission(P.ROOMS_MANAGE), updateRoom);
router.delete('/rooms/:id', authenticate, requirePermission(P.ROOMS_MANAGE), deleteRoom);
router.get('/availability', authenticate, getAvailability);
router.get('/availability/my', authenticate, getMyOverrides);
router.get('/rooms/admin/status', authenticate, requirePermission(P.ROOMS_MANAGE), getAdminRoomStatus);
router.post('/availability/override', authenticate, requirePermission(P.AVAILABILITY_OVERRIDE), overrideRoomAvailability);

// Room Schedule Grid Endpoints
router.get('/rooms/:id/week-schedule', authenticate, requirePermission(P.ROOMS_MANAGE), getRoomWeekSchedule);
router.get('/rooms/:id/conflict-check', authenticate, requirePermission(P.ROOMS_MANAGE), checkRoomConflict);

export default router;

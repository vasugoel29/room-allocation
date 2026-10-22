import express from 'express';
import { body } from 'express-validator';
import { getRooms, getAvailability, getAdminRoomStatus, overrideRoomAvailability, getMyOverrides, createRoom, updateRoom, deleteRoom, getRoomWeekSchedule, checkRoomConflict } from '../controllers/roomController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { roomInAdminScope } from '../middleware/scope.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { idParam, validate, dateKey, hour, positiveInt, text, bool, pagination, oneOf, WEEKDAYS } from '../middleware/validators.js';
import { ROOM_TYPES } from '../repositories/roomRepository.js';
import { isDateKey } from '../utils/timezone.js';

const SEE_ROOMS = [P.CALENDAR, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN];
const router = express.Router();
router.param('id', idParam);

// Presence of required fields is checked in the controllers (their messages are part of the API);
// these check the shape of whatever was sent.
const roomFields = [
  text('name', { optional: true, max: 32 }),
  positiveInt('capacity', { optional: true, max: 10_000 }),
  body('floor').optional({ values: 'null' }).isInt({ min: -5, max: 200 }).withMessage('floor must be a whole number'),
  text('building', { optional: true, max: 100 }),
  oneOf('type', ROOM_TYPES, { optional: true }),
  body('description').optional({ values: 'null' }).isString().isLength({ max: 1000 }).withMessage('description must be at most 1000 characters'),
];

router.get('/rooms', authenticate, requirePermission(...SEE_ROOMS), validate(pagination({ max: 500 })), getRooms);
router.post('/rooms', authenticate, requirePermission(P.ADMIN), validate(roomFields), createRoom);
router.patch('/rooms/:id', authenticate, requirePermission(P.ADMIN), roomInAdminScope, validate([oneOf('type', ROOM_TYPES, { optional: true })]), updateRoom);
router.delete('/rooms/:id', authenticate, requirePermission(P.ADMIN), roomInAdminScope, deleteRoom);
router.get('/availability', authenticate, requirePermission(...SEE_ROOMS), getAvailability);
router.get('/availability/my', authenticate, requirePermission(P.ADMIN), getMyOverrides);
router.get('/rooms/admin/status', authenticate, requirePermission(P.ADMIN),
  validate(dateKey('date', { optional: true }), hour('slot', { optional: true })), getAdminRoomStatus);
router.post('/availability/override', authenticate, requirePermission(P.ADMIN),
  validate(
    text('room_name', { optional: true, max: 32 }),
    body('day').optional({ values: 'falsy' }).custom((v) => WEEKDAYS.includes(v) || isDateKey(v))
      .withMessage(`day must be ${WEEKDAYS.join('/')} or a date (YYYY-MM-DD)`),
    hour('hour', { location: 'body', optional: true }),
    bool('is_available', { optional: true }),
  ), overrideRoomAvailability);

// Room Schedule Grid Endpoints
router.get('/rooms/:id/week-schedule', authenticate, requirePermission(P.ADMIN), roomInAdminScope,
  validate(dateKey('weekStart', { optional: true })), getRoomWeekSchedule);
router.get('/rooms/:id/conflict-check', authenticate, requirePermission(P.ADMIN), roomInAdminScope,
  validate(dateKey('date', { optional: true }), hour('startHour', { optional: true }), hour('endHour', { optional: true, min: 1, max: 24 })),
  checkRoomConflict);

export default router;

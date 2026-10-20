import express from 'express';
import * as timetableController from '../controllers/timetableController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { idParam, validate, dateKey, hour, bool } from '../middleware/validators.js';

const router = express.Router();
router.param('id', idParam);

router.get('/search', authenticate, requirePermission(P.ADMIN), timetableController.searchTimetable);
router.get('/autocomplete/faculty', authenticate, requirePermission(P.TIMETABLE, P.BOOKINGS, P.ADMIN), timetableController.autocompleteFaculty);
router.post('/upload', authenticate, requirePermission(P.ADMIN), timetableController.uploadTimetable);
router.get('/faculty', authenticate, requirePermission(P.TIMETABLE, P.FACULTY_PORTAL), timetableController.getFacultyTimetable);
router.get('/faculty/check/:id', authenticate, requirePermission(P.BOOKINGS, P.BOOKINGS_DIRECT, P.FACULTY_PORTAL, P.ADMIN), validate(dateKey('date'), hour('hour')), timetableController.checkFacultyAvailability);
router.post('/faculty/override', authenticate, requirePermission(P.FACULTY_PORTAL),
  validate(dateKey('date', { location: 'body' }), hour('hour', { location: 'body' }), bool('is_cancelled', { optional: true })),
  timetableController.overrideFacultySlot);
router.get('/faculty/overrides', authenticate, requirePermission(P.FACULTY_PORTAL), timetableController.getFacultyOverrides);
router.get('/cancellation-requests/pending', authenticate, requirePermission(P.FACULTY_PORTAL), timetableController.getPendingCancellationRequests);
router.patch('/cancellation-requests/:id/:action', authenticate, requirePermission(P.FACULTY_PORTAL), timetableController.reviewCancellationRequest);
router.post('/cancellation-requests', authenticate, requirePermission(P.BOOKINGS), timetableController.createCancellationRequest);

// Admin CRUD for individual timetable slots
router.get('/slots', authenticate, requirePermission(P.ADMIN), timetableController.listSlots);
router.post('/slots', authenticate, requirePermission(P.ADMIN), timetableController.createSlot);
router.patch('/slots/:id', authenticate, requirePermission(P.ADMIN), timetableController.updateSlot);
router.delete('/slots/:id', authenticate, requirePermission(P.ADMIN), timetableController.deleteSlot);

router.get('/', authenticate, requirePermission(P.TIMETABLE), timetableController.getTimetable);

export default router;

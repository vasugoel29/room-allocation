import express from 'express';
import * as timetableController from '../controllers/timetableController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';

const router = express.Router();

router.get('/search', authenticate, requirePermission(P.TIMETABLE_MANAGE), timetableController.searchTimetable);
router.get('/autocomplete/faculty', authenticate, timetableController.autocompleteFaculty);
router.post('/upload', authenticate, requirePermission(P.TIMETABLE_MANAGE), timetableController.uploadTimetable);
router.get('/faculty', authenticate, requirePermission(P.TIMETABLE_FACULTY), timetableController.getFacultyTimetable);
router.get('/faculty/check/:id', authenticate, timetableController.checkFacultyAvailability);
router.post('/faculty/override', authenticate, requirePermission(P.TIMETABLE_FACULTY), timetableController.overrideFacultySlot);
router.get('/faculty/overrides', authenticate, requirePermission(P.TIMETABLE_FACULTY), timetableController.getFacultyOverrides);
router.get('/cancellation-requests/pending', authenticate, requirePermission(P.CANCELLATION_REVIEW), timetableController.getPendingCancellationRequests);
router.patch('/cancellation-requests/:id/:action', authenticate, requirePermission(P.CANCELLATION_REVIEW), timetableController.reviewCancellationRequest);
router.post('/cancellation-requests', authenticate, requirePermission(P.CANCELLATION_REQUEST), timetableController.createCancellationRequest);

// Admin CRUD for individual timetable slots
router.get('/slots', authenticate, requirePermission(P.TIMETABLE_MANAGE), timetableController.listSlots);
router.post('/slots', authenticate, requirePermission(P.TIMETABLE_MANAGE), timetableController.createSlot);
router.patch('/slots/:id', authenticate, requirePermission(P.TIMETABLE_MANAGE), timetableController.updateSlot);
router.delete('/slots/:id', authenticate, requirePermission(P.TIMETABLE_MANAGE), timetableController.deleteSlot);

router.get('/', authenticate, timetableController.getTimetable);

export default router;

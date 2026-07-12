import express from 'express';
import * as timetableController from '../controllers/timetableController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/inspect-database', timetableController.inspectDatabase);
router.get('/search', authenticate, requireRole('ADMIN'), timetableController.searchTimetable);
router.get('/autocomplete/faculty', authenticate, timetableController.autocompleteFaculty);
router.post('/upload', authenticate, requireRole('ADMIN'), timetableController.uploadTimetable);
router.get('/faculty', authenticate, requireRole('FACULTY'), timetableController.getFacultyTimetable);
router.get('/faculty/check/:id', authenticate, timetableController.checkFacultyAvailability);
router.post('/faculty/override', authenticate, requireRole('FACULTY'), timetableController.overrideFacultySlot);
router.get('/faculty/overrides', authenticate, requireRole('FACULTY'), timetableController.getFacultyOverrides);
router.get('/cancellation-requests/pending', authenticate, requireRole('FACULTY'), timetableController.getPendingCancellationRequests);
router.patch('/cancellation-requests/:id/:action', authenticate, requireRole('FACULTY'), timetableController.reviewCancellationRequest);
router.post('/cancellation-requests', authenticate, requireRole('STUDENT_REP'), timetableController.createCancellationRequest);

// Admin CRUD for individual timetable slots
router.get('/slots', authenticate, requireRole('ADMIN'), timetableController.listSlots);
router.post('/slots', authenticate, requireRole('ADMIN'), timetableController.createSlot);
router.patch('/slots/:id', authenticate, requireRole('ADMIN'), timetableController.updateSlot);
router.delete('/slots/:id', authenticate, requireRole('ADMIN'), timetableController.deleteSlot);

router.get('/', authenticate, timetableController.getTimetable);

export default router;

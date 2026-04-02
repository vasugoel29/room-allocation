import express from 'express';
import * as timetableController from '../controllers/timetableController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/search', authenticate, requireRole('ADMIN'), timetableController.searchTimetable);
router.post('/upload', authenticate, requireRole('ADMIN'), timetableController.uploadTimetable);
router.get('/faculty', authenticate, requireRole('FACULTY'), timetableController.getFacultyTimetable);
router.get('/faculty/check/:id', authenticate, timetableController.checkFacultyAvailability);
router.post('/faculty/override', authenticate, requireRole('FACULTY'), timetableController.overrideFacultySlot);
router.get('/faculty/overrides', authenticate, requireRole('FACULTY'), timetableController.getFacultyOverrides);
router.get('/', authenticate, timetableController.getTimetable);

export default router;

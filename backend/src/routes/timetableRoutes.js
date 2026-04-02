import express from 'express';
import { getTimetable, uploadTimetable } from '../controllers/timetableController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getTimetable);
router.post('/upload', authenticate, requireRole('ADMIN'), uploadTimetable);

export default router;

import express from 'express';
import * as adminController from '../controllers/adminController.js';
import * as uploadController from '../controllers/uploadController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/export/bookings', authenticate, requireRole('ADMIN'), adminController.exportBookingsCSV);
router.get('/export/promotions', authenticate, requireRole('ADMIN'), adminController.exportPromotionsCSV);
router.get('/audit-logs', authenticate, requireRole('ADMIN'), adminController.getAuditLogs);
router.get('/analytics', authenticate, requireRole('ADMIN'), adminController.getAnalytics);

// Template downloads (CSV)
router.get('/uploads/template/students', authenticate, requireRole('ADMIN'), uploadController.getStudentsTemplate);
router.get('/uploads/template/faculty', authenticate, requireRole('ADMIN'), uploadController.getFacultyTemplate);
router.get('/uploads/template/timetable', authenticate, requireRole('ADMIN'), uploadController.getTimetableTemplate);

// Exports (XLSX)
router.get('/uploads/export/students', authenticate, requireRole('ADMIN'), uploadController.exportStudents);
router.get('/uploads/export/faculty', authenticate, requireRole('ADMIN'), uploadController.exportFaculty);
router.get('/uploads/export/timetable', authenticate, requireRole('ADMIN'), uploadController.exportTimetable);

// Imports (CSV)
router.post('/uploads/import/students', authenticate, requireRole('ADMIN'), uploadController.importStudents);
router.post('/uploads/import/faculty', authenticate, requireRole('ADMIN'), uploadController.importFaculty);
router.post('/uploads/import/timetable', authenticate, requireRole('ADMIN'), uploadController.importTimetable);

export default router;

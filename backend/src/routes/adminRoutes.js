import express from 'express';
import * as adminController from '../controllers/adminController.js';
import * as uploadController from '../controllers/uploadController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';

const router = express.Router();

router.get('/export/bookings', authenticate, requirePermission(P.ADMIN_REPORTS), adminController.exportBookingsCSV);
router.get('/export/promotions', authenticate, requirePermission(P.ADMIN_REPORTS), adminController.exportPromotionsCSV);
router.get('/audit-logs', authenticate, requirePermission(P.ADMIN_REPORTS), adminController.getAuditLogs);
router.get('/analytics', authenticate, requirePermission(P.ADMIN_REPORTS), adminController.getAnalytics);

// Template downloads (CSV)
router.get('/uploads/template/students', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.getStudentsTemplate);
router.get('/uploads/template/faculty', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.getFacultyTemplate);
router.get('/uploads/template/timetable', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.getTimetableTemplate);

// Exports (XLSX)
router.get('/uploads/export/students', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.exportStudents);
router.get('/uploads/export/faculty', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.exportFaculty);
router.get('/uploads/export/timetable', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.exportTimetable);

// Imports (CSV)
router.post('/uploads/import/students', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.importStudents);
router.post('/uploads/import/faculty', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.importFaculty);
router.post('/uploads/import/timetable', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.importTimetable);

// Async job status polling
router.get('/uploads/status/:jobId', authenticate, requirePermission(P.ADMIN_IMPORTS), uploadController.getJobStatus);

export default router;

import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/export/bookings', authenticate, requireRole('ADMIN'), adminController.exportBookingsCSV);
router.get('/export/promotions', authenticate, requireRole('ADMIN'), adminController.exportPromotionsCSV);
router.get('/audit-logs', authenticate, requireRole('ADMIN'), adminController.getAuditLogs);
router.get('/analytics', authenticate, requireRole('ADMIN'), adminController.getAnalytics);

export default router;

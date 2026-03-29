import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/export/bookings', authenticate, requireRole('admin'), adminController.exportBookingsCSV);
router.get('/export/promotions', authenticate, requireRole('admin'), adminController.exportPromotionsCSV);

export default router;

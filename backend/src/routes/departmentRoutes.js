import express from 'express';
import { getDepartments, createDepartment } from '../controllers/departmentController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getDepartments);
router.post('/', authenticate, requireRole('ADMIN'), createDepartment);

export default router;

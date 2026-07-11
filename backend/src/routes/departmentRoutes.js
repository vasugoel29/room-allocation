import express from 'express';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../controllers/departmentController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getDepartments);
router.post('/', authenticate, requireRole('ADMIN'), createDepartment);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateDepartment);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteDepartment);

export default router;

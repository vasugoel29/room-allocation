import express from 'express';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../controllers/departmentController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { idParam } from '../middleware/validators.js';

const router = express.Router();
router.param('id', idParam);

router.get('/', getDepartments);
router.post('/', authenticate, requirePermission(P.DIRECTORY_MANAGE), createDepartment);
router.patch('/:id', authenticate, requirePermission(P.DIRECTORY_MANAGE), updateDepartment);
router.delete('/:id', authenticate, requirePermission(P.DIRECTORY_MANAGE), deleteDepartment);

export default router;

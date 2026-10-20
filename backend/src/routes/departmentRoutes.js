import express from 'express';
import { getDepartments } from '../controllers/departmentController.js';

// Read-only: the college ACL owns this master list and writes it through PUT /api/internal/departments.
const router = express.Router();

router.get('/', getDepartments);

export default router;

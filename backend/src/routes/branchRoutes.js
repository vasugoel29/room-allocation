import express from 'express';
import { getBranches } from '../controllers/branchController.js';

// Read-only: the college ACL owns this master list and writes it through PUT /api/internal/departments.
const router = express.Router();

router.get('/', getBranches);

export default router;

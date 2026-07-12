import express from 'express';
import { createBranch, deleteBranch, getBranches, updateBranch } from '../controllers/branchController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getBranches);
router.post('/', authenticate, requireRole('ADMIN'), createBranch);
router.patch('/:id', authenticate, requireRole('ADMIN'), updateBranch);
router.delete('/:id', authenticate, requireRole('ADMIN'), deleteBranch);

export default router;

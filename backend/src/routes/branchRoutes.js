import express from 'express';
import { createBranch, deleteBranch, getBranches, updateBranch } from '../controllers/branchController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';

const router = express.Router();

router.get('/', getBranches);
router.post('/', authenticate, requirePermission(P.DIRECTORY_MANAGE), createBranch);
router.patch('/:id', authenticate, requirePermission(P.DIRECTORY_MANAGE), updateBranch);
router.delete('/:id', authenticate, requirePermission(P.DIRECTORY_MANAGE), deleteBranch);

export default router;

import express from 'express';
import { getUsers, deleteUser, getFaculties } from '../controllers/authController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { googleLogin, devLogin, me, logout } from '../controllers/sessionController.js';
import { authIpLimiter, authAccountLimiter } from '../middleware/leakyBucket.js';
import { idParam } from '../middleware/validators.js';

// Identity, roles and academic profile come from Google SSO + the central ACL. CRAS has no
// local accounts: no signup, passwords, password reset, approvals or role editing.
const router = express.Router();
router.param('id', idParam);

const authLimiter = [authIpLimiter, authAccountLimiter];

router.post('/google', authLimiter, googleLogin);
router.post('/dev-login', authLimiter, devLogin);
router.get('/me', authenticate, me);
router.post('/logout', logout);

router.get('/faculties', authenticate, requirePermission(P.BOOKINGS, P.BOOKINGS_DIRECT, P.FACULTY_PORTAL, P.ADMIN), getFaculties);

// Admin: read-only mirror of the people who have signed in, plus deactivation (soft delete).
router.get('/users', authenticate, requirePermission(P.ADMIN), getUsers);
router.delete('/users/:id', authenticate, requirePermission(P.ADMIN), deleteUser);

export default router;

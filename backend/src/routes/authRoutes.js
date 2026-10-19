import express from 'express';
import { body } from 'express-validator';
import { signup, login, getUsers, createUser, updateUser, deleteUser, getFaculties, approveUser, forgotPassword, resetPassword, verifyStudent } from '../controllers/authController.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { validateRequest } from '../middleware/validate.js';
import { googleLogin, devLogin, me, logout } from '../controllers/sessionController.js';
import { authIpLimiter, authAccountLimiter } from '../middleware/leakyBucket.js';

const router = express.Router();

const authLimiter = [authIpLimiter, authAccountLimiter];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password cannot be empty')
];

router.post('/google', authLimiter, googleLogin);
router.post('/dev-login', authLimiter, devLogin);
router.get('/me', authenticate, me);
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, loginValidation, validateRequest, login);
router.post('/logout', logout);

router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/verify-student/:rollNo', authLimiter, verifyStudent);

router.get('/faculties', authenticate, getFaculties);

// Admin-only user management
router.get('/users', authenticate, requirePermission(P.USERS_MANAGE), getUsers);
router.post('/users', authenticate, requirePermission(P.USERS_MANAGE), createUser);
router.patch('/users/:id', authenticate, updateUser);
router.delete('/users/:id', authenticate, requirePermission(P.USERS_MANAGE), deleteUser);
router.patch('/approve-user/:id', authenticate, requirePermission(P.USERS_MANAGE), approveUser);

export default router;

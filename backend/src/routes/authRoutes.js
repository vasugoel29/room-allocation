import express from 'express';
import { body } from 'express-validator';
import { signup, login, logout, googleLogin, getUsers, createUser, updateUser, deleteUser, getFaculties, approveUser, forgotPassword, resetPassword, verifyStudent } from '../controllers/authController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { authIpLimiter, authAccountLimiter } from '../middleware/leakyBucket.js';

const router = express.Router();

const authLimiter = [authIpLimiter, authAccountLimiter];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password cannot be empty')
];

router.post('/google', authLimiter, googleLogin);
router.post('/signup', authLimiter, signup);
router.post('/login', authLimiter, loginValidation, validateRequest, login);
router.post('/logout', logout);

router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.get('/verify-student/:rollNo', authLimiter, verifyStudent);

router.get('/faculties', authenticate, getFaculties);

// Admin-only user management
router.get('/users', authenticate, requireRole('ADMIN'), getUsers);
router.post('/users', authenticate, requireRole('ADMIN'), createUser);
router.patch('/users/:id', authenticate, updateUser);
router.delete('/users/:id', authenticate, requireRole('ADMIN'), deleteUser);
router.patch('/approve-user/:id', authenticate, requireRole('ADMIN'), approveUser);

export default router;

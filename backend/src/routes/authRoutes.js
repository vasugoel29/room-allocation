import express from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { signup, login, logout, getUsers, createUser, updateUser, deleteUser, getFaculties, approveUser, forgotPassword, resetPassword, verifyStudent } from '../controllers/authController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 15 : 1000, // Relaxed for dev/testing
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again after 15 minutes.' }
});

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password cannot be empty')
];

router.post('/signup', signup);
router.post('/login', authLimiter, loginValidation, validateRequest, login);
router.post('/logout', logout);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/verify-student/:rollNo', authLimiter, verifyStudent);

router.get('/faculties', authenticate, getFaculties);

// Admin-only user management
router.get('/users', authenticate, requireRole('ADMIN'), getUsers);
router.post('/users', authenticate, requireRole('ADMIN'), createUser);
router.patch('/users/:id', authenticate, updateUser);
router.delete('/users/:id', authenticate, requireRole('ADMIN'), deleteUser);
router.patch('/approve-user/:id', authenticate, requireRole('ADMIN'), approveUser);

export default router;

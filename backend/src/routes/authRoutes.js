import express from 'express';
import rateLimit from 'express-rate-limit';
import { body } from 'express-validator';
import { signup, login, logout, getUsers, createUser, updateUser, deleteUser, getFaculties, approveUser } from '../controllers/authController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: (req, res) => {
    const resetTime = req.rateLimit?.resetTime?.getTime() || (Date.now() + 15 * 60 * 1000);
    const minutes = Math.ceil((resetTime - Date.now()) / 60000);
    return { error: `Too many authentication attempts, please try again in ${Math.max(1, minutes)} minute${minutes !== 1 ? 's' : ''}.` };
  }
});

const signupValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().matches(/@nsut\.ac\.in$/).withMessage('Must be an @nsut.ac.in email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password cannot be empty')
];

router.post('/signup', authLimiter, signupValidation, validateRequest, signup);
router.post('/login', authLimiter, loginValidation, validateRequest, login);
router.post('/logout', logout);

router.get('/faculties', authenticate, getFaculties);

// Admin-only user management
router.get('/users', authenticate, requireRole('admin'), getUsers);
router.post('/users', authenticate, requireRole('admin'), createUser);
router.patch('/users/:id', authenticate, updateUser);
router.delete('/users/:id', authenticate, requireRole('admin'), deleteUser);
router.patch('/approve-user/:id', authenticate, requireRole('admin'), approveUser);

export default router;

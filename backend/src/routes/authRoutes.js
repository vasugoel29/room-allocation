import express from 'express';
import { signup, login, getUsers, createUser, updateUser, deleteUser } from '../controllers/authController.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);

// Admin-only user management
router.get('/users', authenticate, requireRole('admin'), getUsers);
router.post('/users', authenticate, requireRole('admin'), createUser);
router.patch('/users/:id', authenticate, requireRole('admin'), updateUser);
router.delete('/users/:id', authenticate, requireRole('admin'), deleteUser);

export default router;

import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { idParam } from '../middleware/validators.js';
import { listNotifications, unreadCount, markRead, markAllRead, dismiss } from '../controllers/notificationController.js';

const router = express.Router();
router.param('id', idParam);
router.use(authenticate);

router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.post('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.delete('/:id', dismiss);

export default router;

import { sendServerError } from '../utils/httpErrors.js';
import { notificationRepository as inbox } from '../repositories/notificationRepository.js';

/** GET /api/notifications?limit=20&before=<id>&unread=true — newest first, plus the unread count. */
export const listNotifications = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const before = parseInt(req.query.before) || null;
    const [data, unread] = await Promise.all([
      inbox.list(req.user, { limit, before, unreadOnly: req.query.unread === 'true' }),
      inbox.unreadCount(req.user),
    ]);
    res.json({ data, unread });
  } catch (err) {
    sendServerError(res, err, 'Failed to load notifications');
  }
};

/** GET /api/notifications/unread-count — cheap poll for the bell. */
export const unreadCount = async (req, res) => {
  try {
    res.json({ unread: await inbox.unreadCount(req.user) });
  } catch (err) {
    sendServerError(res, err, 'Failed to load notifications');
  }
};

/** PATCH /api/notifications/:id/read */
export const markRead = async (req, res) => {
  try {
    const row = await inbox.markRead(req.user, req.params.id);
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    res.json(row);
  } catch (err) {
    sendServerError(res, err, 'Failed to update the notification');
  }
};

/** POST /api/notifications/read-all */
export const markAllRead = async (req, res) => {
  try {
    res.json({ updated: await inbox.markAllRead(req.user) });
  } catch (err) {
    sendServerError(res, err, 'Failed to update notifications');
  }
};

/** DELETE /api/notifications/:id — dismiss from the inbox (soft delete; the row stays). */
export const dismiss = async (req, res) => {
  try {
    if (!(await inbox.dismiss(req.user, req.params.id))) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification dismissed' });
  } catch (err) {
    sendServerError(res, err, 'Failed to dismiss the notification');
  }
};

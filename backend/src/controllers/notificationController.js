import * as db from '../db.js';
import { sendServerError } from '../utils/httpErrors.js';

// Notifications addressed to this user, or (before their first sign-in) to their email address.
const MINE = `is_active AND (user_id = $1 OR (user_id IS NULL AND lower(email) = lower($2)))`;
const FIELDS = 'id, type, title, body, link, entity_type, entity_id, read_at, created_at';

/** GET /api/notifications?limit=20&before=<id>&unread=true — newest first, plus the unread count. */
export const listNotifications = async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const before = parseInt(req.query.before) || null;
    const unreadOnly = req.query.unread === 'true';
    const params = [req.user.id, req.user.email || '', limit];
    let extra = '';
    if (before) { params.push(before); extra += ` AND id < $${params.length}`; }
    if (unreadOnly) extra += ' AND read_at IS NULL';
    const [list, count] = await Promise.all([
      db.query(`SELECT ${FIELDS} FROM notifications WHERE ${MINE}${extra} ORDER BY id DESC LIMIT $3`, params),
      db.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE ${MINE} AND read_at IS NULL`, params.slice(0, 2)),
    ]);
    res.json({ data: list.rows, unread: count.rows[0].n });
  } catch (err) {
    sendServerError(res, err, 'Failed to load notifications');
  }
};

/** GET /api/notifications/unread-count — cheap poll for the bell. */
export const unreadCount = async (req, res) => {
  try {
    const { rows: [r] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE ${MINE} AND read_at IS NULL`,
      [req.user.id, req.user.email || ''],
    );
    res.json({ unread: r.n });
  } catch (err) {
    sendServerError(res, err, 'Failed to load notifications');
  }
};

/** PATCH /api/notifications/:id/read */
export const markRead = async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
        WHERE id = $3 AND ${MINE} RETURNING ${FIELDS}`,
      [req.user.id, req.user.email || '', req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Notification not found' });
    res.json(rows[0]);
  } catch (err) {
    sendServerError(res, err, 'Failed to update the notification');
  }
};

/** POST /api/notifications/read-all */
export const markAllRead = async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE notifications SET read_at = NOW() WHERE ${MINE} AND read_at IS NULL`,
      [req.user.id, req.user.email || ''],
    );
    res.json({ updated: rowCount });
  } catch (err) {
    sendServerError(res, err, 'Failed to update notifications');
  }
};

/** DELETE /api/notifications/:id — dismiss from the inbox (soft delete; the row stays). */
export const dismiss = async (req, res) => {
  try {
    const { rowCount } = await db.query(
      `UPDATE notifications SET is_active = FALSE, deactivated_at = NOW(), read_at = COALESCE(read_at, NOW())
        WHERE id = $3 AND ${MINE}`,
      [req.user.id, req.user.email || '', req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification dismissed' });
  } catch (err) {
    sendServerError(res, err, 'Failed to dismiss the notification');
  }
};

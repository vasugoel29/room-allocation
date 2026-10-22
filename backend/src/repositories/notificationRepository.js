import * as db from '../db.js';

/**
 * The in-app inbox. A notification belongs to a person by user id, or (before their first sign-in)
 * by email address. `who` = { id, email }.
 */
const MINE = `is_active AND (user_id = $1 OR (user_id IS NULL AND lower(email) = lower($2)))`;
const FIELDS = 'id, type, title, body, link, entity_type, entity_id, read_at, created_at';
const owner = (who) => [who.id, who.email || ''];

export const notificationRepository = {
  /** Newest first; `before` pages by id; `unreadOnly` hides read ones. */
  list: async (who, { limit, before = null, unreadOnly = false }) => {
    const params = [...owner(who), limit];
    let extra = '';
    if (before) { params.push(before); extra += ` AND id < $${params.length}`; }
    if (unreadOnly) extra += ' AND read_at IS NULL';
    return (await db.query(`SELECT ${FIELDS} FROM notifications WHERE ${MINE}${extra} ORDER BY id DESC LIMIT $3`, params)).rows;
  },

  unreadCount: async (who) => (await db.query(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE ${MINE} AND read_at IS NULL`, owner(who),
  )).rows[0].n,

  markRead: async (who, id) => (await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $3 AND ${MINE} RETURNING ${FIELDS}`, [...owner(who), id],
  )).rows[0] || null,

  markAllRead: async (who) => (await db.query(
    `UPDATE notifications SET read_at = NOW() WHERE ${MINE} AND read_at IS NULL`, owner(who),
  )).rowCount,

  /** Dismiss from the inbox: a soft delete, the row stays. */
  dismiss: async (who, id) => (await db.query(
    `UPDATE notifications SET is_active = FALSE, deactivated_at = NOW(), read_at = COALESCE(read_at, NOW())
      WHERE id = $3 AND ${MINE}`, [...owner(who), id],
  )).rowCount > 0,
};

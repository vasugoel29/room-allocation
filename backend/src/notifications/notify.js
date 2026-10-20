import { render } from './templates.js';
import { formatIstRange } from '../utils/timezone.js';

/**
 * Queue notifications inside the caller's transaction (transactional outbox): if the change rolls
 * back, so do its notifications, and nothing is ever sent for something that didn't happen.
 * Delivery is separate — the inbox reads the rows, the email worker sends the pending ones.
 *
 * recipients: [{ userId } | { facultyId }] — inactive people and the actor are skipped,
 * duplicates collapse to one notification.
 */
export async function notify(client, recipients, type, data, { actorId = null, entityType = null, entityId = null } = {}) {
  const content = render(type, data);
  const seen = new Set();
  const created = [];
  for (const r of recipients) {
    const target = await resolve(client, r);
    if (!target) continue;
    if (actorId != null && target.userId != null && Number(target.userId) === Number(actorId)) continue;
    const key = target.userId != null ? `u${target.userId}` : `e${String(target.email).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { rows: [row] } = await client.query(
      `INSERT INTO notifications
         (user_id, email, type, title, body, link, entity_type, entity_id,
          email_status, email_subject, email_html, email_next_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::varchar, $10, $11, CASE WHEN $9::varchar = 'pending' THEN NOW() END)
       RETURNING id, user_id, email, type, email_status`,
      [target.userId, target.email, type, content.title, content.body, content.link, entityType, entityId,
        target.email && process.env.EMAIL_DELIVERY !== 'off' ? 'pending' : 'none', content.subject, content.html],
    );
    created.push(row);
  }
  return created;
}

async function resolve(client, r) {
  if (r?.userId != null) {
    const { rows: [u] } = await client.query('SELECT id, email, is_active FROM users WHERE id = $1', [r.userId]);
    return u && u.is_active !== false ? { userId: u.id, email: u.email || null } : null;
  }
  if (r?.facultyId != null) {
    const { rows: [f] } = await client.query(
      `SELECT f.email, f.is_active, f.user_id, u.is_active AS user_active
         FROM faculties f LEFT JOIN users u ON u.id = f.user_id WHERE f.id = $1`,
      [r.facultyId],
    );
    if (!f || f.is_active === false) return null;
    // A faculty member who has signed in gets it in the inbox too; one who hasn't yet still gets
    // the email, and finds it in the inbox on first sign-in (matched by email).
    const userId = f.user_id != null && f.user_active !== false ? f.user_id : null;
    return userId != null || f.email ? { userId, email: f.email || null } : null;
  }
  return null;
}

/** Template facts for a booking: room, IST date/time, owner. Never the purpose. */
export async function bookingFacts(client, bookingId) {
  const { rows: [b] } = await client.query(
    `SELECT b.id, b.room_id, b.start_time, b.end_time, b.created_by, b.faculty_id, b.status,
            r.name AS room_name, u.name AS owner_name
       FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.created_by
      WHERE b.id = $1`,
    [bookingId],
  );
  if (!b) return null;
  const { date, time } = formatIstRange(b.start_time, b.end_time);
  return { booking: b, data: { roomName: b.room_name, date, time, ownerName: b.owner_name } };
}

export async function personName(client, userId, fallback = 'Someone') {
  if (userId == null) return fallback;
  const { rows: [u] } = await client.query('SELECT name FROM users WHERE id = $1', [userId]);
  return u?.name || fallback;
}

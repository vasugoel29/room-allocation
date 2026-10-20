import * as db from '../db.js';
import logger from '../utils/logger.js';
import { deliverEmail, emailConfigured } from '../utils/emailService.js';

/**
 * Email outbox worker. Claims due `pending` notifications with FOR UPDATE SKIP LOCKED (safe if
 * several instances ever run), sends them, and on failure retries with exponential backoff
 * (1, 2, 4 … 60 min) until MAX_ATTEMPTS or MAX_AGE, then marks them `failed`. A message claimed by
 * a process that died mid-send is reclaimed after STUCK_MS.
 *
 * Without SMTP credentials (development), messages are logged and marked `logged`.
 */
export const MAX_ATTEMPTS = 8;
const MAX_AGE_MS = 24 * 3600_000;
const STUCK_MS = 10 * 60_000;
const BATCH = 20;

let send = deliverEmail;
/** Test hook: replace the transport. */
export const setEmailSender = (fn) => { send = fn || deliverEmail; };

export const backoffMs = (attempts) => Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000;

export async function runEmailBatch({ limit = BATCH } = {}) {
  await db.query(
    `UPDATE notifications SET email_status = 'pending'
      WHERE email_status = 'sending' AND email_next_at < NOW() - make_interval(secs => $1)`,
    [STUCK_MS / 1000],
  );
  const { rows } = await db.query(
    `UPDATE notifications n SET email_status = 'sending', email_next_at = NOW()
      WHERE n.id IN (
        SELECT id FROM notifications
         WHERE email_status = 'pending' AND email_next_at <= NOW()
         ORDER BY email_next_at, id
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING n.id, n.email, n.email_subject, n.email_html, n.email_attempts, n.created_at`,
    [limit],
  );
  const results = { sent: 0, retried: 0, failed: 0, logged: 0 };
  for (const n of rows) {
    if (!emailConfigured() && send === deliverEmail) {
      logger.warn('Email (SMTP not configured, logged only)', { to: n.email, subject: n.email_subject });
      await db.query(`UPDATE notifications SET email_status = 'logged', email_sent_at = NOW() WHERE id = $1`, [n.id]);
      results.logged++;
      continue;
    }
    try {
      await send(n.email, n.email_subject, n.email_html);
      await db.query(
        `UPDATE notifications SET email_status = 'sent', email_sent_at = NOW(), email_attempts = email_attempts + 1,
                email_last_error = NULL WHERE id = $1`,
        [n.id],
      );
      results.sent++;
    } catch (err) {
      const attempts = n.email_attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS || Date.now() - new Date(n.created_at).getTime() > MAX_AGE_MS;
      await db.query(
        `UPDATE notifications
            SET email_status = $2::varchar, email_attempts = $3, email_last_error = $4,
                email_next_at = CASE WHEN $2::varchar = 'pending' THEN NOW() + make_interval(secs => $5) ELSE email_next_at END
          WHERE id = $1`,
        [n.id, giveUp ? 'failed' : 'pending', attempts, String(err?.message || err).slice(0, 500), backoffMs(attempts) / 1000],
      );
      if (giveUp) {
        results.failed++;
        logger.error('Email delivery failed permanently', err, { notificationId: n.id, to: n.email, attempts });
      } else {
        results.retried++;
        logger.warn('Email delivery failed; will retry', { notificationId: n.id, attempts, error: err?.message });
      }
    }
  }
  return results;
}

let timer = null;
let running = false;
/** Starts polling the outbox every `intervalMs`; returns a stop function. */
export function startEmailWorker({ intervalMs = Number(process.env.EMAIL_WORKER_INTERVAL_MS) || 5000 } = {}) {
  if (timer) return stopEmailWorker;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await runEmailBatch(); } catch (err) { logger.error('Email worker batch failed', err); } finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return stopEmailWorker;
}

export function stopEmailWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

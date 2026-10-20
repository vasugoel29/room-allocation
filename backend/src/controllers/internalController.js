import { sendServerError } from '../utils/httpErrors.js';
import crypto from 'crypto';
import * as db from '../db.js';
import logger from '../utils/logger.js';
import { facultyRepository } from '../repositories/facultyRepository.js';
import { logActivity } from '../services/loggerService.js';

/**
 * Service-to-service endpoints called by the central ACL (not by browsers).
 * Authenticated with a shared secret in INTERNAL_SYNC_TOKEN, sent as `Authorization: Bearer <token>`.
 */

const MAX_BATCH = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireInternalToken(req, res, next) {
  const expected = process.env.INTERNAL_SYNC_TOKEN;
  if (!expected || expected.length < 32) {
    return res.status(503).json({ error: 'Internal sync is not configured.' });
  }
  const header = req.headers.authorization || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid internal sync token.' });
  }
  next();
}

/**
 * PUT /api/internal/faculties
 * Body: { faculties: [{ email, name, department_name?, status?: 'active' | 'inactive' }] }
 * Upserts directory entries by email; status "inactive" soft-deletes. Entries not in the batch
 * are left untouched (the caller sends changes or full pages, never implicit deletions).
 */
export async function syncFaculties(req, res) {
  const list = req.body?.faculties;
  if (!Array.isArray(list)) return res.status(400).json({ error: 'Body must be { "faculties": [...] }.' });
  if (list.length > MAX_BATCH) return res.status(413).json({ error: `At most ${MAX_BATCH} faculties per request.` });

  const skipped = [];
  const seen = new Map();
  list.forEach((f, index) => {
    const email = typeof f?.email === 'string' ? f.email.trim().toLowerCase() : '';
    const name = typeof f?.name === 'string' ? f.name.trim() : '';
    const status = typeof f?.status === 'string' ? f.status.trim().toLowerCase() : 'active';
    if (!EMAIL_RE.test(email)) return skipped.push({ index, reason: 'invalid or missing email' });
    if (status !== 'active' && status !== 'inactive') return skipped.push({ index, reason: `unknown status "${f.status}"` });
    if (!name && status === 'active') return skipped.push({ index, reason: 'missing name' });
    if (seen.has(email)) return skipped.push({ index, reason: `duplicate of index ${seen.get(email).index}` });
    seen.set(email, {
      index, email, name,
      department_name: typeof f.department_name === 'string' && f.department_name.trim() ? f.department_name.trim() : null,
      inactive: status === 'inactive',
    });
  });

  const counts = { created: 0, updated: 0, deactivated: 0, unchanged: 0 };
  try {
    await db.runInTransaction(async (client) => {
      for (const entry of seen.values()) {
        if (entry.inactive) {
          const { rows } = await client.query('SELECT id FROM faculties WHERE lower(email) = $1 AND is_active', [entry.email]);
          if (rows[0] && (await facultyRepository.deactivate(rows[0].id, client))) counts.deactivated++;
          else counts.unchanged++;
          continue;
        }
        const saved = await facultyRepository.upsert(entry, client);
        if (saved.inserted) counts.created++; else counts.updated++;
      }
    });
  } catch (err) {
    logger.error('Internal faculty sync failed', err);
    return sendServerError(res, err, 'Faculty sync failed; no changes were applied.');
  }

  await logActivity({
    userId: null,
    action: 'SYNC_FACULTIES',
    entityType: 'faculty',
    details: { source: 'acl', received: list.length, ...counts, skipped: skipped.length },
  });
  return res.json({ ...counts, skipped });
}

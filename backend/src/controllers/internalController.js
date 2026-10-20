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

const text = (v, max = 255) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const statusOf = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : 'active');

/**
 * PUT /api/internal/departments
 * Body: {
 *   departments?: [{ name, acl_id?, status?: 'active' | 'inactive' }],
 *   branches?:    [{ name, short_code?, department, department_acl_id?, acl_id?, status? }]
 * }
 * The college ACL owns the department/branch master list; CRAS keeps a copy written only here.
 * Entries are matched by acl_id when given (so a rename updates the row), else by name (branches:
 * name within their department). "inactive" soft-deletes; entries not sent are left untouched.
 * Departments are applied before branches, so one request can add both. All or nothing.
 */
export async function syncDepartments(req, res) {
  const departments = req.body?.departments ?? [];
  const branches = req.body?.branches ?? [];
  if (!Array.isArray(departments) || !Array.isArray(branches)) {
    return res.status(400).json({ error: 'Body must be { "departments": [...], "branches": [...] }.' });
  }
  if (departments.length + branches.length > MAX_BATCH) {
    return res.status(413).json({ error: `At most ${MAX_BATCH} entries per request.` });
  }

  const skipped = [];
  const counts = {
    departments: { created: 0, updated: 0, deactivated: 0, unchanged: 0 },
    branches: { created: 0, updated: 0, deactivated: 0, unchanged: 0 },
  };

  try {
    await db.runInTransaction(async (client) => {
      for (const [index, d] of departments.entries()) {
        const name = text(d?.name);
        const aclId = text(d?.acl_id, 100);
        const status = statusOf(d?.status);
        if (status !== 'active' && status !== 'inactive') { skipped.push({ kind: 'department', index, reason: `unknown status "${d.status}"` }); continue; }
        if (!name && !aclId) { skipped.push({ kind: 'department', index, reason: 'missing name' }); continue; }
        const { rows: [found] } = await client.query(
          `SELECT * FROM departments
            WHERE ($1::text IS NOT NULL AND acl_id = $1) OR ($1::text IS NULL AND lower(name) = lower($2))
            ORDER BY is_active DESC, id DESC LIMIT 1`,
          [aclId, name],
        );
        const c = counts.departments;
        if (status === 'inactive') {
          if (found?.is_active) {
            await client.query('UPDATE departments SET is_active = FALSE, deactivated_at = NOW(), updated_at = NOW() WHERE id = $1', [found.id]);
            c.deactivated++;
          } else c.unchanged++;
          continue;
        }
        if (!name) { skipped.push({ kind: 'department', index, reason: 'missing name' }); continue; }
        const { rows: [clash] } = await client.query(
          'SELECT id FROM departments WHERE is_active AND lower(name) = lower($1) AND id <> $2', [name, found?.id ?? -1],
        );
        if (clash) { skipped.push({ kind: 'department', index, reason: `another active department is already named "${name}"` }); continue; }
        if (found) {
          const same = found.is_active && found.name === name && (found.acl_id ?? null) === (aclId ?? found.acl_id ?? null);
          if (same) { c.unchanged++; continue; }
          await client.query(
            `UPDATE departments SET name = $2, acl_id = COALESCE($3, acl_id), is_active = TRUE, deactivated_at = NULL, updated_at = NOW()
              WHERE id = $1`, [found.id, name, aclId],
          );
          c.updated++;
        } else {
          await client.query('INSERT INTO departments (name, acl_id, updated_at) VALUES ($1, $2, NOW())', [name, aclId]);
          c.created++;
        }
      }

      for (const [index, b] of branches.entries()) {
        const name = text(b?.name, 100);
        const aclId = text(b?.acl_id, 100);
        const status = statusOf(b?.status);
        if (status !== 'active' && status !== 'inactive') { skipped.push({ kind: 'branch', index, reason: `unknown status "${b.status}"` }); continue; }
        if (!name && !aclId) { skipped.push({ kind: 'branch', index, reason: 'missing name' }); continue; }
        const deptAcl = text(b?.department_acl_id, 100);
        const deptName = text(b?.department);
        let departmentId = null;
        if (deptAcl || deptName) {
          const { rows: [dept] } = await client.query(
            `SELECT id FROM departments WHERE is_active AND (($1::text IS NOT NULL AND acl_id = $1) OR ($1::text IS NULL AND lower(name) = lower($2)))
              LIMIT 1`, [deptAcl, deptName],
          );
          if (!dept && status === 'active') { skipped.push({ kind: 'branch', index, reason: `unknown department "${deptAcl || deptName}"` }); continue; }
          departmentId = dept?.id ?? null;
        }
        const { rows: [found] } = await client.query(
          `SELECT * FROM branches
            WHERE ($1::text IS NOT NULL AND acl_id = $1)
               OR ($1::text IS NULL AND lower(name) = lower($2) AND department_id IS NOT DISTINCT FROM $3)
            ORDER BY is_active DESC, id DESC LIMIT 1`,
          [aclId, name, departmentId],
        );
        const c = counts.branches;
        if (status === 'inactive') {
          if (found?.is_active) {
            await client.query('UPDATE branches SET is_active = FALSE, deactivated_at = NOW(), updated_at = NOW() WHERE id = $1', [found.id]);
            c.deactivated++;
          } else c.unchanged++;
          continue;
        }
        if (!name) { skipped.push({ kind: 'branch', index, reason: 'missing name' }); continue; }
        const shortCode = text(b?.short_code, 100);
        const { rows: [clash] } = await client.query(
          'SELECT id FROM branches WHERE lower(name) = lower($1) AND department_id IS NOT DISTINCT FROM $2 AND id <> $3',
          [name, departmentId, found?.id ?? -1],
        );
        if (clash) { skipped.push({ kind: 'branch', index, reason: `another branch "${name}" exists in that department` }); continue; }
        if (found) {
          const same = found.is_active && found.name === name && (found.short_code ?? null) === shortCode
            && (found.department_id ?? null) === departmentId;
          if (same) { c.unchanged++; continue; }
          await client.query(
            `UPDATE branches SET name = $2, short_code = $3, department_id = $4, acl_id = COALESCE($5, acl_id),
                    is_active = TRUE, deactivated_at = NULL, updated_at = NOW() WHERE id = $1`,
            [found.id, name, shortCode, departmentId, aclId],
          );
          c.updated++;
        } else {
          await client.query(
            'INSERT INTO branches (name, short_code, department_id, acl_id, updated_at) VALUES ($1, $2, $3, $4, NOW())',
            [name, shortCode, departmentId, aclId],
          );
          c.created++;
        }
      }
    });
  } catch (err) {
    logger.error('Internal department sync failed', err);
    return sendServerError(res, err, 'Department sync failed; no changes were applied.');
  }

  await logActivity({
    userId: null,
    action: 'SYNC_DEPARTMENTS',
    entityType: 'department',
    details: { source: 'acl', received: { departments: departments.length, branches: branches.length }, ...counts, skipped: skipped.length },
  });
  return res.json({ ...counts, skipped });
}

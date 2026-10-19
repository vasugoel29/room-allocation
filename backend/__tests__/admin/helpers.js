// Shared helpers for the admin-area tests (not a test file itself).
import request from 'supertest';
import * as db from '../../src/db.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `fn` until it returns a truthy value or the timeout elapses (then returns the last value). */
export async function waitFor(fn, { timeout = 5000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last) return last;
    await sleep(interval);
  }
  return last;
}

/** Polls GET /api/admin/uploads/status/:jobId until the job leaves "processing" (bounded). */
export async function pollJob(app, auth, jobId, { timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const res = await request(app).get(`/api/admin/uploads/status/${jobId}`).set('Authorization', auth);
    if (res.status !== 200) throw new Error(`status poll returned ${res.status}: ${JSON.stringify(res.body)}`);
    if (res.body.status !== 'processing') return res.body;
    await sleep(50);
  }
  throw new Error(`Job ${jobId} still processing after ${timeout}ms`);
}

/** POSTs a CSV import and waits for the job to finish. Returns { post, job }. */
export async function runImport(app, auth, kind, csvContent) {
  const post = await request(app)
    .post(`/api/admin/uploads/import/${kind}`)
    .set('Authorization', auth)
    .send({ csvContent });
  if (post.status !== 202) return { post, job: null };
  const job = await pollJob(app, auth, post.body.jobId);
  return { post, job };
}

/** supertest parser that collects the raw body into a Buffer (for XLSX downloads). */
export function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

export const maxAuditId = async () => (await db.query('SELECT COALESCE(MAX(id), 0)::int AS id FROM audit_logs')).rows[0].id;

/** Waits for audit rows with `action` written after `sinceId` (the audit middleware writes on 'finish', asynchronously). */
export async function auditRowsSince(sinceId, action, { min = 1, timeout = 3000 } = {}) {
  const rows = await waitFor(async () => {
    const { rows } = await db.query('SELECT * FROM audit_logs WHERE id > $1 AND action = $2 ORDER BY id', [sinceId, action]);
    return rows.length >= min ? rows : null;
  }, { timeout });
  return rows || [];
}

let n = 0;
/** Unique, lowercase token for building test emails/names. */
export const uniq = () => `${process.pid}${Date.now().toString(36)}${(n++).toString(36)}`;

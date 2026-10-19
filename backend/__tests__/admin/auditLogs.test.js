// GET /api/admin/audit-logs and what the global audit middleware stores (SEC-14).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { mockAcl } from '../../src/auth/aclClient.js';
import { setGoogleVerifier } from '../../src/auth/google.js';
import { createAdmin, createUser, closeDb } from '../../test/helpers/factories.js';
import { uniq, maxAuditId, auditRowsSince, pollJob } from './helpers.js';

let admin;
beforeAll(async () => {
  admin = await createAdmin();
});
afterEach(() => setGoogleVerifier(null));
afterAll(async () => {
  mockAcl.clear();
  await closeDb();
});

/** Registers a fresh email in the mock ACL (see sso.test.js for the full response shape) and returns it. */
function signInable(tag) {
  const email = `audit.${tag}.${uniq()}@nsut.ac.in`;
  mockAcl.set(email, {
    user: { id: `usr_audit_${uniq()}`, name: 'AUDIT TEST USER', email, type: 'STUDENT', status: 'ACTIVE', academic: {} },
    app: 'CRAS', role: 'VIEWER', roles: ['VIEWER'], permissions: ['rooms:view'], allowed_scope: {}, scopes_by_permission: {},
  });
  return email;
}

const getLogs = (query = {}) => request(app).get('/api/admin/audit-logs').query(query).set('Authorization', admin.auth);

/** Inserts `n` audit rows with action `${prefix}_<i>`, created_at spaced 1 minute apart (i=0 oldest). */
async function seedAudit(prefix, n, { userId = admin.user.id, base = '2099-01-01T00:00:00Z' } = {}) {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, details, created_at)
     SELECT $1, $2 || '_' || g, 'test', '{}'::jsonb, $3::timestamptz + (g || ' minutes')::interval
     FROM generate_series(0, $4 - 1) g`,
    [userId, prefix, base, n],
  );
}

describe('GET /api/admin/audit-logs', () => {
  test('defaults to page 1 / limit 20 with total + totalPages, newest first, joined with user name/email', async () => {
    const prefix = `AUD_DEF_${uniq()}`.toUpperCase();
    // Far-future created_at so these are the newest rows in the table.
    await seedAudit(prefix, 3, { base: '2199-01-01T00:00:00Z' });
    const res = await getLogs();
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({
      total: expect.any(Number), page: 1, limit: 20, totalPages: Math.ceil(res.body.meta.total / 20),
    });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(res.body.data.length).toBe(Math.min(20, res.body.meta.total));
    expect(res.body.data.slice(0, 3).map((r) => r.action)).toEqual([`${prefix}_2`, `${prefix}_1`, `${prefix}_0`]);
    expect(res.body.data[0]).toMatchObject({ user_id: admin.user.id, user_name: admin.user.name, user_email: admin.user.email, entity_type: 'test' });
  });

  test('search matches action (case-insensitive) and pagination slices the filtered set', async () => {
    const prefix = `AUD_PAGE_${uniq()}`.toUpperCase();
    await seedAudit(prefix, 5);
    const res = await getLogs({ search: prefix.toLowerCase(), page: 2, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 5, page: 2, limit: 2, totalPages: 3 });
    expect(res.body.data.map((r) => r.action)).toEqual([`${prefix}_2`, `${prefix}_1`]);

    const last = await getLogs({ search: prefix, page: 3, limit: 2 });
    expect(last.body.data.map((r) => r.action)).toEqual([`${prefix}_0`]);
    const beyond = await getLogs({ search: prefix, page: 9, limit: 2 });
    expect(beyond.status).toBe(200);
    expect(beyond.body.data).toEqual([]);
  });

  test('search also matches the acting user name', async () => {
    const actor = await createUser({ name: `Audit Actor ${uniq()}` });
    await seedAudit(`AUD_ACTOR_${uniq()}`.toUpperCase(), 2, { userId: actor.user.id });
    const res = await getLogs({ search: actor.user.name, limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((r) => r.user_id === actor.user.id && r.user_email === actor.user.email)).toBe(true);
  });

  test('non-numeric page/limit fall back to defaults; page=0 / limit=0 are treated as defaults', async () => {
    for (const q of [{ page: 'abc', limit: 'xyz' }, { page: 0, limit: 0 }]) {
      const res = await getLogs(q);
      expect(res.status).toBe(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
    }
  });

  test.each([
    ['negative page', { page: -1 }],
    ['negative limit', { limit: -5 }],
  ])('[NEW-admin-3] %s is rejected (400) or clamped, never a 500', async (_label, q) => {
    const res = await getLogs(q);
    expect(res.status).not.toBe(500);
  });

  // QUESTION: the exact cap is a product decision; 100 is used here as a sane upper bound.
  test('[NEW-admin-3] limit is capped (limit=100000 must not dump the whole audit table)', async () => {
    const prefix = `AUD_BIG_${uniq()}`.toUpperCase();
    await seedAudit(prefix, 120);
    const res = await getLogs({ search: prefix, limit: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });
});

describe('audit middleware contents (SEC-14)', () => {
  test('a successful admin mutation is recorded with method/path/status and the acting user', async () => {
    const since = await maxAuditId();
    const csv = `name,email\nAudit Faculty ${uniq()},audit.fac.${uniq()}@nsut.ac.in\n`;
    const post = await request(app).post('/api/admin/uploads/import/faculty').set('Authorization', admin.auth).send({ csvContent: csv });
    expect(post.status).toBe(202);
    await pollJob(app, admin.auth, post.body.jobId);
    const [row] = await auditRowsSince(since, 'POST_API_ADMIN_UPLOADS_IMPORT_FACULTY');
    expect(row).toBeDefined();
    expect(row.user_id).toBe(admin.user.id);
    expect(row.entity_type).toBe('admin');
    expect(row.details).toMatchObject({ method: 'POST', path: '/api/admin/uploads/import/faculty', status: 202 });
    // The controller additionally writes its own semantic entry.
    const [semantic] = await auditRowsSince(since, 'IMPORT_FACULTY_CSV');
    expect(semantic).toMatchObject({ user_id: admin.user.id, entity_type: 'upload', details: { recordCount: 1 } });
  });

  test('top-level `password` fields are stripped from stored bodies', async () => {
    const email = signInable('pwd');
    const since = await maxAuditId();
    // dev-login ignores the extra field; the audit middleware still sees it in the body.
    const res = await request(app).post('/api/auth/dev-login').send({ email, password: 'Password@123' });
    expect(res.status).toBe(200);
    const [row] = await auditRowsSince(since, 'POST_API_AUTH_DEV-LOGIN');
    expect(row).toBeDefined();
    expect(row.details).toMatchObject({ method: 'POST', path: '/api/auth/dev-login', status: 200, body: { email } });
    expect(JSON.stringify(row.details)).not.toContain('Password@123');
  });

  // Only `password` is stripped, so the whole Google ID token (a bearer credential for its
  // lifetime, and full of personal data) is persisted in audit_logs.details.body.credential.
  test('[SEC-14] a Google ID token (credential) is not stored in the audit log', async () => {
    const email = signInable('gcred');
    setGoogleVerifier(async () => ({ email, email_verified: true, hd: 'nsut.ac.in', sub: `g-${email}` }));
    const credential = `google-id-token-${uniq()}`;
    const since = await maxAuditId();
    const res = await request(app).post('/api/auth/google').send({ credential });
    expect(res.status).toBe(200);
    const [row] = await auditRowsSince(since, 'POST_API_AUTH_GOOGLE');
    expect(row).toBeDefined();
    expect(JSON.stringify(row.details)).not.toContain(credential);
  });

  // The middleware falls back to `userId || req.user?.id || 1`, so every anonymous mutation
  // (sign-in, logout without a token) is attributed to whoever owns users.id = 1.
  test('[SEC-14] unauthenticated actions are not attributed to user id 1', async () => {
    await createUser(); // make sure a user 1 exists (fresh DB) and it isn't the sign-in target
    const email = signInable('anon');
    const since = await maxAuditId();
    const res = await request(app).post('/api/auth/dev-login').send({ email });
    expect(res.status).toBe(200);
    expect(res.body.user.id).not.toBe(1);
    const [row] = await auditRowsSince(since, 'POST_API_AUTH_DEV-LOGIN');
    expect(row).toBeDefined();
    expect(row.user_id).not.toBe(1);
  });

  test('[SEC-14] CSV import content is not stored verbatim in the audit log', async () => {
    const email = `audit.csv.${uniq()}@nsut.ac.in`;
    const secret = `S3cret-${uniq()}`;
    const csv = `name,email,password\nCsv Prof ${secret},${email},${secret}\n`;
    const since = await maxAuditId();
    const post = await request(app).post('/api/admin/uploads/import/faculty').set('Authorization', admin.auth).send({ csvContent: csv });
    expect(post.status).toBe(202);
    const job = await pollJob(app, admin.auth, post.body.jobId);
    expect(job.status).toBe('completed');
    const [row] = await auditRowsSince(since, 'POST_API_ADMIN_UPLOADS_IMPORT_FACULTY');
    expect(row).toBeDefined();
    const stored = JSON.stringify(row.details);
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(email);
    // The audit keeps that a CSV was uploaded and its size, not its contents.
    expect(row.details.body.csvContent).toMatch(/^\[\d+ chars omitted\]$/);
  });
});

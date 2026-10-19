// PUT /api/internal/faculties — the central ACL's cron pushes faculty-directory changes into CRAS.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, createFacultyEntry, closeDb } from '../../test/helpers/factories.js';

const TOKEN = 'internal-sync-token-for-tests-0123456789abcdef';
let seq = 0;
const email = (tag) => `sync.${tag}.${process.pid}.${Date.now().toString(36)}${seq++}@nsut.ac.in`;
const push = (body, token = TOKEN) => request(app).put('/api/internal/faculties').set('Authorization', `Bearer ${token}`).send(body);
const entry = async (e) => (await db.query('SELECT * FROM faculties WHERE lower(email) = $1', [e])).rows[0];

beforeAll(() => { process.env.INTERNAL_SYNC_TOKEN = TOKEN; });
afterAll(async () => { delete process.env.INTERNAL_SYNC_TOKEN; await closeDb(); });

describe('authentication', () => {
  test('missing or wrong token → 401, nothing written', async () => {
    const e = email('noauth');
    expect((await request(app).put('/api/internal/faculties').send({ faculties: [{ email: e, name: 'X' }] })).status).toBe(401);
    expect((await push({ faculties: [{ email: e, name: 'X' }] }, 'wrong-token-wrong-token-wrong-token')).status).toBe(401);
    expect(await entry(e)).toBeUndefined();
  });

  test('a user session token (even an admin) is not accepted', async () => {
    const admin = await createAdmin();
    expect((await push({ faculties: [] }, admin.token)).status).toBe(401);
  });

  test('server without INTERNAL_SYNC_TOKEN (or a short one) refuses with 503', async () => {
    process.env.INTERNAL_SYNC_TOKEN = 'short';
    try {
      expect((await push({ faculties: [] }, 'short')).status).toBe(503);
    } finally {
      process.env.INTERNAL_SYNC_TOKEN = TOKEN;
    }
  });
});

describe('sync', () => {
  test('creates and updates entries by email (case-insensitive) and reports counts', async () => {
    const a = email('a');
    const b = email('b');
    const first = await push({ faculties: [{ email: a, name: 'Prof A', department_name: 'IT' }, { email: b.toUpperCase(), name: 'Prof B' }] });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ created: 2, updated: 0, deactivated: 0, skipped: [] });
    expect(await entry(a)).toMatchObject({ name: 'Prof A', department_name: 'IT', is_active: true });

    const second = await push({ faculties: [{ email: a, name: 'Prof A Renamed' }] });
    expect(second.body).toMatchObject({ created: 0, updated: 1 });
    // department_name is kept when the push omits it
    expect(await entry(a)).toMatchObject({ name: 'Prof A Renamed', department_name: 'IT' });
  });

  test('status=inactive soft-deletes (row and booking history kept); a later active push reactivates', async () => {
    const fac = await createFaculty();
    const e = fac.faculty.email;
    const res = await push({ faculties: [{ email: e, status: 'inactive' }] });
    expect(res.body).toMatchObject({ deactivated: 1 });
    const off = await entry(e);
    expect(off.is_active).toBe(false);
    expect(off.deactivated_at).not.toBeNull();
    expect(off.id).toBe(fac.faculty.id);

    const fl = await request(app).get('/api/auth/faculties').set('Authorization', fac.auth);
    expect(fl.body.map((f) => f.id)).not.toContain(fac.faculty.id);

    expect((await push({ faculties: [{ email: e, status: 'inactive' }] })).body).toMatchObject({ deactivated: 0, unchanged: 1 });
    expect((await push({ faculties: [{ email: e, name: fac.faculty.name }] })).body).toMatchObject({ updated: 1 });
    expect((await entry(e)).is_active).toBe(true);
  });

  test('entries not mentioned in a push are left untouched', async () => {
    const other = await createFacultyEntry({ email: email('untouched') });
    await push({ faculties: [{ email: email('c'), name: 'Prof C' }] });
    expect((await entry(other.email)).is_active).toBe(true);
  });

  test('invalid rows are skipped with their index; valid rows still apply', async () => {
    const ok = email('ok');
    const res = await push({ faculties: [
      { email: 'not-an-email', name: 'Bad' },
      { email: ok, name: 'Good' },
      { email: ok, name: 'Duplicate' },
      { email: email('noname') },
      { email: email('weird'), name: 'W', status: 'retired' },
    ] });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped.map((s) => s.index)).toEqual([0, 2, 3, 4]);
    expect(res.body.skipped[1].reason).toMatch(/duplicate of index 1/);
    expect((await entry(ok)).name).toBe('Good');
  });

  test('malformed body → 400; oversized batch → 413', async () => {
    expect((await push({ nope: [] })).status).toBe(400);
    const many = Array.from({ length: 5001 }, (_, i) => ({ email: `x${i}@nsut.ac.in`, name: 'X' }));
    expect((await push({ faculties: many })).status).toBe(413);
  });

  test('accepts bodies above the 100kb browser limit (bulk pushes)', async () => {
    const batch = Array.from({ length: 1500 }, (_, i) => ({ email: email(`bulk${i}`), name: `Bulk Faculty Member Number ${i}`, department_name: 'Department of Information Technology' }));
    expect(JSON.stringify({ faculties: batch }).length).toBeGreaterThan(100 * 1024);
    const res = await push({ faculties: batch });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1500);
  }, 30000);

  test('writes one summarised audit entry (no per-row payload)', async () => {
    await push({ faculties: [{ email: email('audit'), name: 'Audited' }] });
    const { rows: [log] } = await db.query(`SELECT * FROM audit_logs WHERE action = 'SYNC_FACULTIES' ORDER BY id DESC LIMIT 1`);
    expect(log.user_id).toBeNull();
    expect(log.details).toMatchObject({ source: 'acl', received: 1, created: 1 });
    expect(JSON.stringify(log.details)).not.toMatch(/Audited/);
  });
});

// PUT /api/internal/departments — the college ACL's cron pushes the department/branch master list.
// CRAS keeps its own copy (read-only in the app); this endpoint is the only writer.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, closeDb } from '../../test/helpers/factories.js';

const TOKEN = 'internal-sync-token-for-tests-0123456789abcdef';
let seq = 0;
const uniq = (p) => `${p} ${process.pid}-${Date.now().toString(36)}-${seq++}`;
const push = (body, token = TOKEN) => request(app).put('/api/internal/departments').set('Authorization', `Bearer ${token}`).send(body);
const dept = async (where, v) => (await db.query(`SELECT * FROM departments WHERE ${where} ORDER BY id DESC LIMIT 1`, [v])).rows[0];
const branch = async (where, v) => (await db.query(`SELECT * FROM branches WHERE ${where} ORDER BY id DESC LIMIT 1`, [v])).rows[0];

beforeAll(() => { process.env.INTERNAL_SYNC_TOKEN = TOKEN; });
afterAll(async () => { delete process.env.INTERNAL_SYNC_TOKEN; await closeDb(); });

describe('authentication', () => {
  test('missing, wrong or user-session tokens → 401; nothing written', async () => {
    const name = uniq('Dept NoAuth');
    expect((await request(app).put('/api/internal/departments').send({ departments: [{ name }] })).status).toBe(401);
    expect((await push({ departments: [{ name }] }, 'wrong-token-wrong-token-wrong-token')).status).toBe(401);
    expect((await push({ departments: [{ name }] }, (await createAdmin()).token)).status).toBe(401);
    expect(await dept('name = $1', name)).toBeUndefined();
  });
});

describe('departments', () => {
  test('creates, then is idempotent; a rename keyed by acl_id updates the same row', async () => {
    const aclId = uniq('acl-d');
    const name = uniq('Department of Sync');
    const first = await push({ departments: [{ acl_id: aclId, name }] });
    expect(first.status).toBe(200);
    expect(first.body.departments).toMatchObject({ created: 1 });
    const row = await dept('acl_id = $1', aclId);
    expect(row).toMatchObject({ name, is_active: true });

    expect((await push({ departments: [{ acl_id: aclId, name }] })).body.departments).toMatchObject({ unchanged: 1 });

    const renamed = `${name} (renamed)`;
    expect((await push({ departments: [{ acl_id: aclId, name: renamed }] })).body.departments).toMatchObject({ updated: 1 });
    expect(await dept('acl_id = $1', aclId)).toMatchObject({ id: row.id, name: renamed });
  });

  test('without acl_id entries match by name (case-insensitive)', async () => {
    const name = uniq('Department of Names');
    await push({ departments: [{ name }] });
    const res = await push({ departments: [{ name: name.toUpperCase() }] });
    expect(res.body.departments).toMatchObject({ updated: 1, created: 0 });
    expect((await db.query('SELECT count(*)::int AS c FROM departments WHERE lower(name) = lower($1)', [name])).rows[0].c).toBe(1);
  });

  test('"inactive" soft-deletes (row kept, hidden from GET); "active" again re-activates the same row', async () => {
    const aclId = uniq('acl-off');
    const name = uniq('Department of Leaving');
    await push({ departments: [{ acl_id: aclId, name }] });
    const { id } = await dept('acl_id = $1', aclId);
    expect((await push({ departments: [{ acl_id: aclId, status: 'inactive' }] })).body.departments).toMatchObject({ deactivated: 1 });
    expect(await dept('id = $1', id)).toMatchObject({ is_active: false, deactivated_at: expect.any(Date) });
    expect((await request(app).get('/api/departments')).body.map((d) => d.id)).not.toContain(id);

    expect((await push({ departments: [{ acl_id: aclId, name }] })).body.departments).toMatchObject({ updated: 1 });
    expect(await dept('id = $1', id)).toMatchObject({ is_active: true, deactivated_at: null });
  });

  test('bad rows are skipped and reported; good rows in the same request still apply', async () => {
    const good = uniq('Department of Good');
    const taken = uniq('Department of Taken');
    await push({ departments: [{ name: taken }] });
    const res = await push({ departments: [{ name: good }, {}, { name: 'x', status: 'archived' }, { acl_id: uniq('acl-clash'), name: taken }] });
    expect(res.status).toBe(200);
    expect(res.body.departments).toMatchObject({ created: 1 });
    expect(res.body.skipped).toEqual([
      { kind: 'department', index: 1, reason: 'missing name' },
      { kind: 'department', index: 2, reason: 'unknown status "archived"' },
      { kind: 'department', index: 3, reason: `another active department is already named "${taken}"` },
    ]);
  });
});

describe('branches', () => {
  test('a branch can reference a department sent in the same request (by name or acl_id)', async () => {
    const dAcl = uniq('acl-dept');
    const dName = uniq('Department of Branches');
    const res = await push({
      departments: [{ acl_id: dAcl, name: dName }],
      branches: [
        { acl_id: uniq('acl-b1'), name: 'Computer Science', short_code: 'CSE', department_acl_id: dAcl },
        { name: 'Data Science', short_code: 'CSDS', department: dName },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.branches).toMatchObject({ created: 2 });
    const d = await dept('acl_id = $1', dAcl);
    const listed = (await request(app).get('/api/branches')).body.filter((b) => b.department_id === d.id);
    expect(listed.map((b) => [b.name, b.short_code, b.department_name]).sort()).toEqual([
      ['Computer Science', 'CSE', dName], ['Data Science', 'CSDS', dName],
    ]);
  });

  test('update by acl_id, soft delete, unknown department skipped', async () => {
    const dName = uniq('Department of Moves');
    await push({ departments: [{ name: dName }] });
    const bAcl = uniq('acl-b');
    await push({ branches: [{ acl_id: bAcl, name: 'Electronics', short_code: 'ECE', department: dName }] });
    const { id } = await branch('acl_id = $1', bAcl);

    expect((await push({ branches: [{ acl_id: bAcl, name: 'Electronics & Comm.', short_code: 'ECE', department: dName }] })).body.branches)
      .toMatchObject({ updated: 1 });
    expect(await branch('id = $1', id)).toMatchObject({ name: 'Electronics & Comm.' });

    expect((await push({ branches: [{ acl_id: bAcl, status: 'inactive' }] })).body.branches).toMatchObject({ deactivated: 1 });
    expect(await branch('id = $1', id)).toMatchObject({ is_active: false });

    const res = await push({ branches: [{ name: 'Orphan', department: uniq('No Such Department') }] });
    expect(res.body.skipped[0]).toMatchObject({ kind: 'branch', index: 0, reason: expect.stringMatching(/unknown department/) });
  });
});

describe('validation', () => {
  test('non-array body → 400; the sync is audited', async () => {
    expect((await push({ departments: 'nope' })).status).toBe(400);
    await push({ departments: [{ name: uniq('Department of Audit') }] });
    const { rows: [a] } = await db.query("SELECT details FROM audit_logs WHERE action = 'SYNC_DEPARTMENTS' ORDER BY id DESC LIMIT 1");
    expect(a.details).toMatchObject({ source: 'acl', departments: { created: 1 } });
  });
});

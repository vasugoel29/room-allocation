// /api/departments and /api/branches CRUD (GET is public, mutations admin-only).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, createRep, createViewer, closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

let n = 0;
const uniq = (p) => `${p} ${process.pid}-${Date.now().toString(36)}-${n++}`;
const lowerRoles = [['VIEWER', createViewer], ['STUDENT_REP', createRep], ['FACULTY', createFaculty]];
const SQL_LEAK = /violates|constraint|syntax|relation|column|duplicate key|invalid input/i;

let admin;
beforeAll(async () => { admin = await createAdmin(); });

const newDept = async (name = uniq('Department of Testing')) =>
  (await db.query('INSERT INTO departments (name) VALUES ($1) RETURNING *', [name])).rows[0];
const newBranch = async (o = {}) =>
  (await db.query('INSERT INTO branches (name, short_code, department_id) VALUES ($1, $2, $3) RETURNING *',
    [o.name || uniq('Branch'), o.short_code ?? 'TB', o.department_id ?? null])).rows[0];

// ─── Departments ────────────────────────────────────────────────────────────
describe('departments', () => {
  test('GET is public and returns all active departments sorted by name', async () => {
    const d = await newDept();
    const res = await request(app).get('/api/departments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find((x) => x.id === d.id)).toMatchObject({ id: d.id, name: d.name, is_active: true });
    const names = res.body.map((x) => x.name);
    const { rows } = await db.query('SELECT name FROM departments WHERE is_active ORDER BY name ASC');
    expect(names).toEqual(rows.map((r) => r.name));
  });

  test('GET with page & limit → {data, meta}', async () => {
    const res = await request(app).get('/api/departments?page=2&limit=3');
    expect(res.status).toBe(200);
    const { rows: [{ c }] } = await db.query('SELECT count(*)::int AS c FROM departments WHERE is_active');
    expect(res.body.meta).toEqual({ total: c, page: 2, limit: 3, totalPages: Math.ceil(c / 3) });
    expect(res.body.data.length).toBeLessThanOrEqual(3);
  });

  test('POST (admin) creates → 201', async () => {
    const name = uniq('Department of Created');
    const res = await request(app).post('/api/departments').set('Authorization', admin.auth).send({ name });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name });
    expect((await db.query('SELECT 1 FROM departments WHERE id = $1', [res.body.id])).rows).toHaveLength(1);
  });

  // QUESTION: creating an existing name is an idempotent upsert (201 with the existing row), not a 409.
  test('POST with an existing name returns the existing department (upsert)', async () => {
    const d = await newDept();
    const res = await request(app).post('/api/departments').set('Authorization', admin.auth).send({ name: d.name });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(d.id);
  });

  test('POST without name → 400', async () => {
    const res = await request(app).post('/api/departments').set('Authorization', admin.auth).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Department name is required' });
  });

  test('PATCH (admin) renames → 200', async () => {
    const d = await newDept();
    const name = uniq('Department of Renamed');
    const res = await request(app).patch(`/api/departments/${d.id}`).set('Authorization', admin.auth).send({ name });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: d.id, name });
  });

  test('PATCH without name → 400; unknown id → 404', async () => {
    const d = await newDept();
    expect((await request(app).patch(`/api/departments/${d.id}`).set('Authorization', admin.auth).send({})).status).toBe(400);
    const res = await request(app).patch('/api/departments/999999').set('Authorization', admin.auth).send({ name: uniq('x') });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Department not found' });
  });

  test('[SEC-12] PATCH to a duplicate name → 409 without leaking the DB constraint text', async () => {
    const a = await newDept();
    const b = await newDept();
    const res = await request(app).patch(`/api/departments/${b.id}`).set('Authorization', admin.auth).send({ name: a.name });
    expect(JSON.stringify(res.body)).not.toMatch(SQL_LEAK);
    expect(res.status).toBe(409);
  });

  test('DELETE (admin) soft-deletes it: row kept (is_active=false), users/branches keep department_id; hidden from GET; second delete 404', async () => {
    const d = await newDept();
    const { user } = await createFaculty({ department_id: d.id });
    const br = await newBranch({ department_id: d.id });
    const res = await request(app).delete(`/api/departments/${d.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'Success', message: `Department ${d.name} deleted successfully` });
    const { rows: [row] } = await db.query('SELECT * FROM departments WHERE id = $1', [d.id]);
    expect(row).toMatchObject({ id: d.id, name: d.name, is_active: false });
    expect(row.deactivated_at).not.toBeNull();
    expect((await db.query('SELECT department_id FROM users WHERE id = $1', [user.id])).rows[0].department_id).toBe(d.id);
    expect((await db.query('SELECT department_id FROM branches WHERE id = $1', [br.id])).rows[0].department_id).toBe(d.id);
    expect((await request(app).get('/api/departments')).body.map((x) => x.id)).not.toContain(d.id);
    expect((await request(app).patch(`/api/departments/${d.id}`).set('Authorization', admin.auth).send({ name: uniq('x') })).status).toBe(404);
    const again = await request(app).delete(`/api/departments/${d.id}`).set('Authorization', admin.auth);
    expect(again.status).toBe(404);
  });

  test('a soft-deleted department\'s name can be created again (unique among active rows only)', async () => {
    const d = await newDept();
    expect((await request(app).delete(`/api/departments/${d.id}`).set('Authorization', admin.auth)).status).toBe(200);
    const res = await request(app).post('/api/departments').set('Authorization', admin.auth).send({ name: d.name });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(d.id);
    expect(res.body).toMatchObject({ name: d.name, is_active: true });
    // ...and POSTing it once more upserts onto the new active row.
    const again = await request(app).post('/api/departments').set('Authorization', admin.auth).send({ name: d.name });
    expect(again.body.id).toBe(res.body.id);
  });

  test('DELETE unknown id → 404', async () => {
    const res = await request(app).delete('/api/departments/999999').set('Authorization', admin.auth);
    expect(res.status).toBe(404);
  });

  test('[SEC-12] non-numeric id → 4xx without leaking Postgres error text', async () => {
    const res = await request(app).delete('/api/departments/abc').set('Authorization', admin.auth);
    expect(JSON.stringify(res.body)).not.toMatch(SQL_LEAK);
    expect(res.status).toBeLessThan(500);
  });

  test('mutations without a token → 401', async () => {
    const d = await newDept();
    expect((await request(app).post('/api/departments').send({ name: uniq('x') })).status).toBe(401);
    expect((await request(app).patch(`/api/departments/${d.id}`).send({ name: uniq('x') })).status).toBe(401);
    expect((await request(app).delete(`/api/departments/${d.id}`)).status).toBe(401);
  });

  test.each(lowerRoles)('%s → 403 on POST/PATCH/DELETE and nothing changes', async (_r, make) => {
    const { auth } = await make();
    const d = await newDept();
    const name = uniq('Department of Forbidden');
    expect((await request(app).post('/api/departments').set('Authorization', auth).send({ name })).status).toBe(403);
    expect((await request(app).patch(`/api/departments/${d.id}`).set('Authorization', auth).send({ name })).status).toBe(403);
    expect((await request(app).delete(`/api/departments/${d.id}`).set('Authorization', auth)).status).toBe(403);
    expect((await db.query('SELECT name FROM departments WHERE id = $1', [d.id])).rows[0].name).toBe(d.name);
    expect((await db.query('SELECT 1 FROM departments WHERE name = $1', [name])).rows).toHaveLength(0);
  });
});

// ─── Branches ───────────────────────────────────────────────────────────────
describe('branches', () => {
  test('GET is public and includes department_name', async () => {
    const d = await newDept();
    const b = await newBranch({ department_id: d.id });
    const res = await request(app).get('/api/branches');
    expect(res.status).toBe(200);
    expect(res.body.find((x) => x.id === b.id)).toMatchObject({ id: b.id, name: b.name, short_code: 'TB', department_id: d.id, department_name: d.name });
  });

  test('GET with page & limit → {data, meta}', async () => {
    await newBranch();
    const res = await request(app).get('/api/branches?page=1&limit=1');
    expect(res.status).toBe(200);
    const { rows: [{ c }] } = await db.query('SELECT count(*)::int AS c FROM branches WHERE is_active');
    expect(res.body.meta).toEqual({ total: c, page: 1, limit: 1, totalPages: c });
    expect(res.body.data).toHaveLength(1);
  });

  test('POST (admin) trims name, upper-cases short_code, parses department_id → 201', async () => {
    const d = await newDept();
    const name = uniq('Computer Things');
    const res = await request(app).post('/api/branches').set('Authorization', admin.auth)
      .send({ name: `  ${name}  `, short_code: ' cse-x ', department_id: String(d.id) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name, short_code: 'CSE-X', department_id: d.id });
  });

  test('POST without short_code / department stores nulls', async () => {
    const res = await request(app).post('/api/branches').set('Authorization', admin.auth).send({ name: uniq('Bare') });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ short_code: null, department_id: null });
  });

  test.each([[{}], [{ name: '   ' }]])('POST with missing/blank name %j → 400', async (body) => {
    const res = await request(app).post('/api/branches').set('Authorization', admin.auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Branch name is required' });
  });

  test('[SEC-12] POST duplicate (name, department) → 409 without leaking constraint text', async () => {
    const d = await newDept();
    const b = await newBranch({ department_id: d.id });
    const res = await request(app).post('/api/branches').set('Authorization', admin.auth).send({ name: b.name, department_id: d.id });
    expect(JSON.stringify(res.body)).not.toMatch(SQL_LEAK);
    expect(res.status).toBe(409);
  });

  test('[SEC-12] POST with a non-existent department_id → 400 without leaking FK text', async () => {
    const res = await request(app).post('/api/branches').set('Authorization', admin.auth).send({ name: uniq('Orphan'), department_id: 999999 });
    expect(JSON.stringify(res.body)).not.toMatch(SQL_LEAK);
    expect(res.status).toBe(400);
  });

  test('PATCH (admin) replaces all fields (omitted short_code/department become NULL)', async () => {
    const d = await newDept();
    const b = await newBranch({ department_id: d.id, short_code: 'OLD' });
    const name = uniq('Renamed Branch');
    const res = await request(app).patch(`/api/branches/${b.id}`).set('Authorization', admin.auth).send({ name });
    expect(res.status).toBe(200);
    // QUESTION: PATCH behaves like PUT — omitting short_code/department_id clears them.
    expect(res.body).toMatchObject({ id: b.id, name, short_code: null, department_id: null });
  });

  test('PATCH without name → 400; unknown id → 404', async () => {
    const b = await newBranch();
    expect((await request(app).patch(`/api/branches/${b.id}`).set('Authorization', admin.auth).send({ short_code: 'X' })).status).toBe(400);
    const res = await request(app).patch('/api/branches/999999').set('Authorization', admin.auth).send({ name: uniq('x') });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Branch not found' });
  });

  test('DELETE (admin) soft-deletes it: row kept, users.branch_id kept, hidden from GET; second delete 404', async () => {
    const b = await newBranch();
    const { user } = await createViewer({ branch_id: b.id });
    const res = await request(app).delete(`/api/branches/${b.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'Success', message: `Branch ${b.name} deleted successfully` });
    const { rows: [row] } = await db.query('SELECT * FROM branches WHERE id = $1', [b.id]);
    expect(row).toMatchObject({ id: b.id, name: b.name, is_active: false });
    expect(row.deactivated_at).not.toBeNull();
    expect((await db.query('SELECT branch_id FROM users WHERE id = $1', [user.id])).rows[0].branch_id).toBe(b.id);
    expect((await request(app).get('/api/branches')).body.map((x) => x.id)).not.toContain(b.id);
    expect((await request(app).patch(`/api/branches/${b.id}`).set('Authorization', admin.auth).send({ name: uniq('x') })).status).toBe(404);
    expect((await request(app).delete(`/api/branches/${b.id}`).set('Authorization', admin.auth)).status).toBe(404);
  });

  test('DELETE unknown id → 404', async () => {
    expect((await request(app).delete('/api/branches/999999').set('Authorization', admin.auth)).status).toBe(404);
  });

  test('mutations without a token → 401', async () => {
    const b = await newBranch();
    expect((await request(app).post('/api/branches').send({ name: uniq('x') })).status).toBe(401);
    expect((await request(app).patch(`/api/branches/${b.id}`).send({ name: uniq('x') })).status).toBe(401);
    expect((await request(app).delete(`/api/branches/${b.id}`)).status).toBe(401);
  });

  test.each(lowerRoles)('%s → 403 on POST/PATCH/DELETE and nothing changes', async (_r, make) => {
    const { auth } = await make();
    const b = await newBranch();
    const name = uniq('Forbidden Branch');
    expect((await request(app).post('/api/branches').set('Authorization', auth).send({ name })).status).toBe(403);
    expect((await request(app).patch(`/api/branches/${b.id}`).set('Authorization', auth).send({ name })).status).toBe(403);
    expect((await request(app).delete(`/api/branches/${b.id}`).set('Authorization', auth)).status).toBe(403);
    expect((await db.query('SELECT name FROM branches WHERE id = $1', [b.id])).rows[0].name).toBe(b.name);
  });
});

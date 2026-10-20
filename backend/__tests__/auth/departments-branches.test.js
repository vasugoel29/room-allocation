// /api/departments and /api/branches: public, read-only. The college ACL owns the master list and writes
// it through PUT /api/internal/departments (see admin/internalDepartmentSync.test.js).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

let n = 0;
const uniq = (p) => `${p} ${process.pid}-${Date.now().toString(36)}-${n++}`;

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

});

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

});

describe('no editing in CRAS', () => {
  test.each([
    ['post', '/api/departments'], ['patch', '/api/departments/1'], ['delete', '/api/departments/1'],
    ['post', '/api/branches'], ['patch', '/api/branches/1'], ['delete', '/api/branches/1'],
  ])('%s %s is gone, even for an admin (404), and nothing changes', async (m, path) => {
    const d = await newDept();
    const before = (await db.query('SELECT count(*)::int AS c FROM departments')).rows[0].c;
    const res = await request(app)[m](path.replace('/1', `/${d.id}`)).set('Authorization', admin.auth).send({ name: 'Renamed' });
    expect(res.status).toBe(404);
    expect((await db.query('SELECT count(*)::int AS c FROM departments')).rows[0].c).toBe(before);
    expect((await db.query('SELECT name, is_active FROM departments WHERE id = $1', [d.id])).rows[0]).toEqual({ name: d.name, is_active: true });
  });
});

// Cross-cutting security suite: authorization matrix over every mounted route, JWT attacks,
// SQL-injection probes, body-size limit, error leakage, security headers and CORS.
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, createRep, createViewer, tokenFor, closeDb } from '../../test/helpers/factories.js';

// No route may call out to the network (the removed verify-student proxy used to).
const realFetch = globalThis.fetch;
const fetchMock = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
beforeAll(() => { globalThis.fetch = fetchMock; });
afterAll(async () => { globalThis.fetch = realFetch; await closeDb(); });

const ROLES = ['VIEWER', 'STUDENT_REP', 'FACULTY', 'ADMIN'];
const users = {};
beforeAll(async () => {
  users.VIEWER = await createViewer();
  users.STUDENT_REP = await createRep();
  users.FACULTY = await createFaculty();
  users.ADMIN = await createAdmin();
});

const X = 999999; // non-existent id: authorised calls must not mutate anything

/**
 * Every route mounted in src/server.js + src/routes/*.js.
 *  min:    PUBLIC (no auth by design) | the minimum role that should be allowed.
 *  path:   string, or fn(user) for self-scoped routes.
 *  bug:    finding ID when the CURRENT gate is weaker than `min` (asserted with test.failing).
 */
const ROUTES = [
  // server.js
  { m: 'get', path: '/', min: 'PUBLIC' },
  { m: 'get', path: '/api/health', min: 'PUBLIC' },
  { m: 'get', path: '/metrics', min: 'ADMIN', bug: 'SEC-13' },
  // authRoutes
  { m: 'post', path: '/api/auth/logout', min: 'PUBLIC' },
  { m: 'post', path: '/api/auth/google', min: 'PUBLIC', body: {} },
  { m: 'post', path: '/api/auth/dev-login', min: 'PUBLIC', body: {} },
  { m: 'get', path: '/api/auth/me', min: 'VIEWER' },
  { m: 'get', path: '/api/auth/faculties', min: 'VIEWER' },
  { m: 'get', path: '/api/auth/users', min: 'ADMIN' },
  { m: 'delete', path: `/api/auth/users/${X}`, min: 'ADMIN' },
  // roomRoutes (mounted at /api)
  { m: 'get', path: '/api/rooms', min: 'VIEWER' },
  { m: 'post', path: '/api/rooms', min: 'ADMIN', body: {} },
  { m: 'patch', path: `/api/rooms/${X}`, min: 'ADMIN', body: { capacity: 1 } },
  { m: 'delete', path: `/api/rooms/${X}`, min: 'ADMIN' },
  { m: 'get', path: '/api/availability', min: 'VIEWER' },
  { m: 'get', path: '/api/availability/my', min: 'VIEWER' },
  { m: 'get', path: '/api/rooms/admin/status', min: 'ADMIN' },
  { m: 'post', path: '/api/availability/override', min: 'STUDENT_REP', body: {} },
  { m: 'get', path: `/api/rooms/${X}/week-schedule`, min: 'ADMIN' },
  { m: 'get', path: `/api/rooms/${X}/conflict-check`, min: 'ADMIN' },
  // bookingRoutes
  { m: 'get', path: '/api/bookings', min: 'VIEWER' },
  { m: 'post', path: '/api/bookings', min: 'STUDENT_REP', body: {} },
  { m: 'patch', path: `/api/bookings/${X}/cancel`, min: 'VIEWER' },
  { m: 'patch', path: `/api/bookings/${X}`, min: 'STUDENT_REP', body: {} },
  { m: 'get', path: '/api/bookings/admin/all', min: 'ADMIN' },
  { m: 'post', path: '/api/bookings/admin/quick', min: 'ADMIN', body: {} },
  // facultyRoutes
  { m: 'get', path: '/api/faculty/pending', min: 'FACULTY' },
  { m: 'patch', path: `/api/faculty/${X}/approve`, min: 'FACULTY' },
  { m: 'patch', path: `/api/faculty/${X}/reject`, min: 'FACULTY' },
  // transferRoutes — requesting a transfer is a booking action, which VIEWERs cannot perform.
  { m: 'post', path: '/api/transfers/request', min: 'STUDENT_REP', body: { booking_id: X }, bug: 'SEC-06' },
  { m: 'get', path: '/api/transfers/incoming', min: 'VIEWER' },
  { m: 'get', path: '/api/transfers/outgoing', min: 'VIEWER' },
  { m: 'patch', path: `/api/transfers/${X}/accept`, min: 'VIEWER' },
  { m: 'patch', path: `/api/transfers/${X}/reject`, min: 'VIEWER' },
  // departmentRoutes / branchRoutes
  { m: 'get', path: '/api/departments', min: 'PUBLIC' },
  { m: 'post', path: '/api/departments', min: 'ADMIN', body: {} },
  { m: 'patch', path: `/api/departments/${X}`, min: 'ADMIN', body: {} },
  { m: 'delete', path: `/api/departments/${X}`, min: 'ADMIN' },
  { m: 'get', path: '/api/branches', min: 'PUBLIC' },
  { m: 'post', path: '/api/branches', min: 'ADMIN', body: {} },
  { m: 'patch', path: `/api/branches/${X}`, min: 'ADMIN', body: {} },
  { m: 'delete', path: `/api/branches/${X}`, min: 'ADMIN' },
  // adminRoutes
  { m: 'get', path: '/api/admin/export/bookings', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/audit-logs', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/analytics', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/uploads/template/faculty', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/uploads/template/timetable', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/uploads/export/students', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/uploads/export/faculty', min: 'ADMIN' },
  { m: 'get', path: '/api/admin/uploads/export/timetable', min: 'ADMIN' },
  { m: 'post', path: '/api/admin/uploads/import/faculty', min: 'ADMIN', body: {} },
  { m: 'post', path: '/api/admin/uploads/import/timetable', min: 'ADMIN', body: {} },
  { m: 'get', path: '/api/admin/uploads/status/no-such-job', min: 'ADMIN' },
  // timetableRoutes
  { m: 'get', path: '/api/timetable/inspect-database', min: 'ADMIN', bug: 'SEC-11' },
  { m: 'get', path: '/api/timetable/search', min: 'ADMIN' },
  { m: 'get', path: '/api/timetable/autocomplete/faculty', min: 'VIEWER' },
  { m: 'post', path: '/api/timetable/upload', min: 'ADMIN', body: {} },
  { m: 'get', path: '/api/timetable/faculty', min: 'FACULTY' },
  { m: 'get', path: `/api/timetable/faculty/check/${X}`, min: 'VIEWER' },
  { m: 'post', path: '/api/timetable/faculty/override', min: 'FACULTY', body: {} },
  { m: 'get', path: '/api/timetable/faculty/overrides', min: 'FACULTY' },
  { m: 'get', path: '/api/timetable/cancellation-requests/pending', min: 'FACULTY' },
  { m: 'patch', path: `/api/timetable/cancellation-requests/${X}/approve`, min: 'FACULTY' },
  { m: 'post', path: '/api/timetable/cancellation-requests', min: 'STUDENT_REP', body: {} },
  { m: 'get', path: '/api/timetable/slots', min: 'ADMIN' },
  { m: 'post', path: '/api/timetable/slots', min: 'ADMIN', body: {} },
  { m: 'patch', path: `/api/timetable/slots/${X}`, min: 'ADMIN', body: {} },
  { m: 'delete', path: `/api/timetable/slots/${X}`, min: 'ADMIN' },
  { m: 'get', path: '/api/timetable', min: 'VIEWER' },
];

const label = (r) => `${r.m.toUpperCase()} ${typeof r.path === 'function' ? r.path({ id: ':self' }) : r.path}`;
const call = (r, user, auth) => {
  const p = typeof r.path === 'function' ? r.path(user || { id: X }) : r.path;
  let req = request(app)[r.m](p);
  if (auth) req = req.set('Authorization', auth);
  return r.body !== undefined ? req.send(r.body) : req;
};

describe('authorization matrix', () => {
  test('route table covers every router registration in src/routes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(process.cwd(), 'src/routes');
    let count = 0;
    // internalRoutes.js is service-to-service (shared token, no user roles): covered by admin/internalSync.test.js.
    for (const f of fs.readdirSync(dir).filter((n) => n !== 'internalRoutes.js')) count += (fs.readFileSync(path.join(dir, f), 'utf8').match(/^router\.(get|post|patch|put|delete)\(/gm) || []).length;
    // + '/', '/api/health', '/metrics' from server.js
    expect(ROUTES.length).toBe(count + 3);
  });

  // Password-era and promotion endpoints were removed on purpose (identity, roles and profile are
  // owned by Google SSO + the ACL). They must look like unknown routes to everyone: never served
  // (200) and never gated (401/403), which would mean a handler or auth middleware is still mounted.
  const REMOVED = [
    ['post', '/api/auth/signup', { email: 'removed.signup@nsut.ac.in', password: 'Password@123', name: 'x' }],
    ['post', '/api/auth/login', { email: 'removed.login@nsut.ac.in', password: 'Password@123' }],
    ['post', '/api/auth/forgot-password', { email: 'removed.forgot@nsut.ac.in' }],
    ['post', '/api/auth/reset-password', { token: 'abc', password: 'Password@123' }],
    ['get', '/api/auth/verify-student/2021UCS1234'],
    ['post', '/api/auth/users', { name: 'x', email: 'removed.create@nsut.ac.in', password: 'Password@123', role: 'ADMIN' }],
    ['patch', (u) => `/api/auth/users/${u.id}`, { role: 'ADMIN', name: 'Removed Edit' }],
    ['patch', (u) => `/api/auth/approve-user/${u.id}`],
    ['post', '/api/promotions', { reason: 'x' }],
    ['get', '/api/promotions/me'],
    ['get', '/api/promotions'],
    ['patch', `/api/promotions/${X}`, { status: 'APPROVED' }],
    ['get', '/api/admin/export/promotions'],
    ['get', '/api/admin/uploads/template/students'],
    ['post', '/api/admin/uploads/import/students', { csvContent: 'name,email\nX,removed.import@nsut.ac.in\n' }],
  ];
  test.each(REMOVED.flatMap(([m, p, body]) => ['anonymous', 'ADMIN'].map((who) => [
    `${m.toUpperCase()} ${typeof p === 'function' ? p({ id: ':self' }) : p}`, who, { m, path: p, body },
  ])))('removed endpoint %s → 404 for %s caller', async (_l, who, r) => {
    const caller = who === 'ADMIN' ? users.ADMIN : null;
    const before = caller && (await db.query('SELECT role, name FROM users WHERE id = $1', [caller.user.id])).rows[0];
    const res = await call(r, caller?.user, caller?.auth);
    expect(res.status).toBe(404);
    if (caller) expect((await db.query('SELECT role, name FROM users WHERE id = $1', [caller.user.id])).rows[0]).toEqual(before);
  });

  test('removed endpoints left no side effects', async () => {
    const { rowCount } = await db.query("SELECT 1 FROM users WHERE email LIKE 'removed.%@nsut.ac.in'");
    expect(rowCount).toBe(0);
  });

  const nonPublic = ROUTES.filter((r) => r.min !== 'PUBLIC' && !r.bug);
  test.each(nonPublic.map((r) => [label(r), r]))('%s: no token → 401', async (_l, r) => {
    const res = await call(r);
    expect(res.status).toBe(401);
  });

  const gated = ROUTES.filter((r) => r.min !== 'PUBLIC' && r.min !== 'VIEWER' && !r.bug);
  test.each(gated.map((r) => [label(r), r]))('%s: one role below the minimum → 403', async (_l, r) => {
    const below = ROLES[ROLES.indexOf(r.min) - 1];
    const res = await call(r, users[below].user, users[below].auth);
    expect(res.status).toBe(403);
  });

  // Note: the 403 check for VIEWER-minimum routes on someone else's resource is ownership, not role — covered elsewhere.
  test.each(ROUTES.filter((r) => !r.bug).map((r) => [label(r), r]))('%s: minimum role passes the gate', async (_l, r) => {
    const who = r.min === 'PUBLIC' ? null : users[r.min];
    const res = await call(r, who?.user, who?.auth);
    expect([401, 403]).not.toContain(res.status);
  });

  test('public routes are reachable without a token', async () => {
    for (const r of ROUTES.filter((x) => x.min === 'PUBLIC')) {
      const res = await call(r);
      expect({ route: label(r), blocked: [401, 403].includes(res.status) }).toEqual({ route: label(r), blocked: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('GET /api/health reports DB connectivity', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });

  test.failing('[SEC-13] GET /metrics requires authentication', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(401);
  });

  test.failing('[SEC-13] GET /metrics is admin-only (FACULTY → 403)', async () => {
    const res = await request(app).get('/metrics').set('Authorization', users.FACULTY.auth);
    expect(res.status).toBe(403);
  });

  test.failing('[SEC-11] GET /api/timetable/inspect-database requires authentication', async () => {
    const res = await request(app).get('/api/timetable/inspect-database');
    expect(res.status).toBe(401);
  });

  test.failing('[SEC-11] GET /api/timetable/inspect-database is admin-only (FACULTY → 403)', async () => {
    const res = await request(app).get('/api/timetable/inspect-database').set('Authorization', users.FACULTY.auth);
    expect(res.status).toBe(403);
  });

  test('POST /api/transfers/request requires authentication', async () => {
    expect((await request(app).post('/api/transfers/request').send({ booking_id: X })).status).toBe(401);
  });

  test.failing('[SEC-06] VIEWER cannot request a booking transfer (→ 403)', async () => {
    const res = await request(app).post('/api/transfers/request').set('Authorization', users.VIEWER.auth).send({ booking_id: X });
    expect(res.status).toBe(403);
  });

  test('STUDENT_REP passes the transfer-request gate', async () => {
    const res = await request(app).post('/api/transfers/request').set('Authorization', users.STUDENT_REP.auth).send({ booking_id: X });
    expect([401, 403]).not.toContain(res.status);
  });
});

// ─── JWT attacks ────────────────────────────────────────────────────────────
describe('JWT handling', () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ANY = '/api/auth/faculties';
  const ADMIN_ONLY = '/api/auth/users';
  const get = (p, header) => { const r = request(app).get(p); return header === undefined ? r : r.set('Authorization', header); };

  test('no Authorization header → 401 "Missing or invalid token"', async () => {
    const res = await get(ANY);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid token' });
  });

  test.each([
    ['non-Bearer scheme', (t) => `Basic ${t}`],
    ['bare token without scheme', (t) => t],
    ['lower-case bearer', (t) => `bearer ${t}`],
  ])('%s → 401', async (_n, fmt) => {
    expect((await get(ANY, fmt(users.ADMIN.token))).status).toBe(401);
  });

  test.each([
    ['garbage', 'Bearer not-a-jwt'],
    ['three empty segments', 'Bearer ..'],
    ['empty token', 'Bearer '],
    ['truncated signature', () => `Bearer ${users.ADMIN.token.slice(0, -5)}`],
  ])('malformed token (%s) → 401 "Invalid token"', async (_n, h) => {
    const res = await get(ANY, typeof h === 'function' ? h() : h);
    expect(res.status).toBe(401);
  });

  test('alg:none token → 401', async () => {
    const { user } = users.ADMIN;
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: user.id, role: 'ADMIN', email: user.email, iat: Math.floor(Date.now() / 1000) })}.`;
    expect((await get(ADMIN_ONLY, `Bearer ${token}`)).status).toBe(401);
    expect((await get(ANY, `Bearer ${token}`)).status).toBe(401);
  });

  test('token signed with the wrong secret → 401', async () => {
    const token = jwt.sign({ id: users.VIEWER.user.id, role: 'VIEWER' }, 'not-the-secret');
    const res = await get(ANY, `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token' });
  });

  test('expired token → 401', async () => {
    const token = tokenFor(users.ADMIN.user, { expiresIn: -10 });
    expect((await get(ANY, `Bearer ${token}`)).status).toBe(401);
  });

  test('raised role claim re-signed with a wrong secret → 401 on admin route', async () => {
    const { user } = users.VIEWER;
    const forged = jwt.sign({ ...jwt.decode(users.VIEWER.token), role: 'ADMIN' }, 'attacker-secret');
    expect((await get(ADMIN_ONLY, `Bearer ${forged}`)).status).toBe(401);
    expect(user.role).toBe('VIEWER');
  });

  test('raised role claim with original signature (payload tampered) → 401', async () => {
    const [h, , s] = users.VIEWER.token.split('.');
    const p = b64({ ...jwt.decode(users.VIEWER.token), role: 'ADMIN' });
    expect((await get(ADMIN_ONLY, `Bearer ${h}.${p}.${s}`)).status).toBe(401);
  });

  test('token in a cookie is not accepted by authenticate (header-only)', async () => {
    const res = await request(app).get(ANY).set('Cookie', `token=${users.ADMIN.token}`);
    expect(res.status).toBe(401);
  });

  test('[SEC-09] token of a deleted user is rejected', async () => {
    const { user, auth } = await createViewer();
    await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    expect((await get(ANY, auth)).status).toBe(401);
  });

  test('[SEC-09] demoted admin loses admin access immediately (stale role claim)', async () => {
    const { user, auth } = await createAdmin();
    expect((await get(ADMIN_ONLY, auth)).status).toBe(200);
    await db.query("UPDATE users SET role = 'VIEWER' WHERE id = $1", [user.id]);
    expect((await get(ADMIN_ONLY, auth)).status).toBe(403);
  });
});

// ─── Injection / input hardening ────────────────────────────────────────────
describe('SQL-injection probes', () => {
  const PAYLOADS = ["' OR '1'='1", "1; DROP TABLE users;--", "1' UNION SELECT password FROM users--", '1 OR 1=1'];
  const HASH = /\$2[aby]\$\d\d\$/;
  const SQL_TEXT = /syntax error|unterminated|invalid input syntax|pg_|relation "/i;

  const probes = [];
  for (const p of PAYLOADS) {
    const e = encodeURIComponent(p);
    probes.push(
      ['VIEWER', `/api/departments?page=${e}&limit=${e}`],
      ['VIEWER', `/api/branches?page=1&limit=${e}`],
      ['VIEWER', `/api/rooms?building=${e}&type=${e}`],
      ['VIEWER', `/api/timetable/autocomplete/faculty?query=${e}`],
      ['ADMIN', `/api/auth/users?page=${e}&limit=5`],
      ['ADMIN', `/api/timetable/slots?faculty_name=${e}&day_of_week=${e}&semester=${e}`],
      ['ADMIN', `/api/admin/audit-logs?action=${e}`],
    );
  }

  test.each(probes)('%s GET %s → no 500, no hash/SQL leak', async (role, url) => {
    const res = await request(app).get(url).set('Authorization', users[role].auth);
    expect(res.status).toBeLessThan(500);
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(HASH);
    expect(text).not.toMatch(SQL_TEXT);
  });

  test('autocomplete with a tautology does not return every user', async () => {
    const res = await request(app).get(`/api/timetable/autocomplete/faculty?query=${encodeURIComponent("' OR '1'='1")}`).set('Authorization', users.VIEWER.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('probes did not destroy or alter data', async () => {
    const { rows } = await db.query('SELECT count(*)::int AS c FROM users WHERE id = ANY($1)', [Object.values(users).map((u) => u.user.id)]);
    expect(rows[0].c).toBe(4);
  });

  test.failing('[SEC-12] injection in a numeric path param → 4xx without Postgres error text', async () => {
    const res = await request(app).get(`/api/timetable/faculty/check/${encodeURIComponent('1 OR 1=1')}`).set('Authorization', users.VIEWER.auth);
    expect(JSON.stringify(res.body)).not.toMatch(SQL_TEXT);
    expect(res.status).toBeLessThan(500);
  });
});

describe('request hardening', () => {
  test('JSON body over 100kb → 413', async () => {
    const res = await request(app).post('/api/auth/dev-login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@nsut.ac.in', pad: 'x'.repeat(110 * 1024) }));
    expect(res.status).toBe(413);
  });

  test('malformed JSON → 400', async () => {
    const res = await request(app).post('/api/auth/dev-login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
  });

  test.failing('[SEC-12] 4xx/5xx bodies never include a stack trace or internal error text', async () => {
    const bodies = [];
    bodies.push((await request(app).post('/api/auth/dev-login').set('Content-Type', 'application/json').send('{"email": ')).body);
    bodies.push((await request(app).post('/api/auth/dev-login').set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(110 * 1024) }))).body);
    for (const b of bodies) {
      expect(b).not.toHaveProperty('stack');
      expect(JSON.stringify(b)).not.toMatch(/at .*\.js:\d+|is not defined|node_modules/);
    }
  });

  test.failing('[SEC-14] anonymous mutations are not attributed to user id 1 in the audit log', async () => {
    const marker = `audit-marker-${Date.now()}`;
    // Logout without a token is an anonymous 2xx mutation, so the audit middleware records it.
    expect((await request(app).post('/api/auth/logout').send({ marker })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const { rows } = await db.query("SELECT user_id FROM audit_logs WHERE details::text LIKE '%' || $1 || '%'", [marker]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
  });
});

describe('security headers & CORS', () => {
  test('helmet headers are set and X-Powered-By is removed', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  const allowed = (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173'])[0];

  test('allowed origin is reflected with credentials', async () => {
    const res = await request(app).get('/api/health').set('Origin', allowed);
    expect(res.headers['access-control-allow-origin']).toBe(allowed);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test.each(['https://evil.example', 'null', `${allowed}.evil.example`])('disallowed origin %s is not reflected', async (origin) => {
    const res = await request(app).get('/api/health').set('Origin', origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(app).options('/api/auth/dev-login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });
});

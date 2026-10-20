// Cross-cutting security suite: authorization matrix over every mounted route, JWT attacks,
// SQL-injection probes, body-size limit, error leakage, security headers and CORS.
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, createRep, createViewer, tokenFor, grantPermissions, closeDb } from '../../test/helpers/factories.js';
import { PERMISSIONS, CATALOG } from '../../src/auth/permissions.js';

// No route may call out to the network (the removed verify-student proxy used to).
const realFetch = globalThis.fetch;
const fetchMock = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
beforeAll(() => { globalThis.fetch = fetchMock; });
afterAll(async () => { globalThis.fetch = realFetch; await closeDb(); });

const P = PERMISSIONS;
// Signed-in users holding exactly one permission each, plus one holding none.
const users = {};
beforeAll(async () => {
  users.none = await createViewer({ permissions: [] });
  for (const perm of Object.values(P)) users[perm] = await createViewer({ permissions: [perm] });
  users.ADMIN = await createAdmin();
  // Typical people (suggested ACL bundles) for the non-matrix tests below.
  users.VIEWER = await createViewer();
  users.STUDENT_REP = await createRep();
  users.FACULTY = await createFaculty();
});

const X = 999999; // non-existent id: authorised calls must not mutate anything

const SEE_CALENDAR = [P.CALENDAR, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN];
const BOOK = [P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN];
const ANSWER = [P.BOOKINGS, P.FACULTY_PORTAL, P.ADMIN];
const ADMIN = [P.ADMIN];

/**
 * Every route mounted in src/server.js + src/routes/*.js and its gate:
 *  'PUBLIC' (no sign-in) | 'AUTH' (any signed-in person) | [permissions] (any one of them).
 * Ownership (your booking, requests naming you) is checked by the services and tested there.
 */
const ROUTES = [
  // server.js
  { m: 'get', path: '/', gate: 'PUBLIC' },
  { m: 'get', path: '/api/health', gate: 'PUBLIC' },
  { m: 'get', path: '/api/permissions/catalog', gate: 'PUBLIC' },
  // authRoutes
  { m: 'post', path: '/api/auth/logout', gate: 'PUBLIC' },
  { m: 'post', path: '/api/auth/google', gate: 'PUBLIC', body: {} },
  { m: 'post', path: '/api/auth/dev-login', gate: 'PUBLIC', body: {} },
  { m: 'get', path: '/api/auth/me', gate: 'AUTH' },
  { m: 'get', path: '/api/auth/faculties', gate: [P.BOOKINGS, P.BOOKINGS_DIRECT, P.FACULTY_PORTAL, P.ADMIN] },
  { m: 'get', path: '/api/auth/users', gate: ADMIN },
  { m: 'delete', path: `/api/auth/users/${X}`, gate: ADMIN },
  // roomRoutes (mounted at /api)
  { m: 'get', path: '/api/rooms', gate: SEE_CALENDAR },
  { m: 'post', path: '/api/rooms', gate: ADMIN, body: {} },
  { m: 'patch', path: `/api/rooms/${X}`, gate: ADMIN, body: { capacity: 1 } },
  { m: 'delete', path: `/api/rooms/${X}`, gate: ADMIN },
  { m: 'get', path: '/api/availability', gate: SEE_CALENDAR },
  { m: 'get', path: '/api/availability/my', gate: ADMIN },
  { m: 'get', path: '/api/rooms/admin/status', gate: ADMIN },
  { m: 'post', path: '/api/availability/override', gate: ADMIN, body: {} },
  { m: 'get', path: `/api/rooms/${X}/week-schedule`, gate: ADMIN },
  { m: 'get', path: `/api/rooms/${X}/conflict-check`, gate: ADMIN },
  // notificationRoutes (everyone's own inbox)
  { m: 'get', path: '/api/notifications', gate: 'AUTH' },
  { m: 'get', path: '/api/notifications/unread-count', gate: 'AUTH' },
  { m: 'post', path: '/api/notifications/read-all', gate: 'AUTH' },
  { m: 'patch', path: `/api/notifications/${X}/read`, gate: 'AUTH' },
  { m: 'delete', path: `/api/notifications/${X}`, gate: 'AUTH' },
  // bookingRoutes
  { m: 'get', path: '/api/bookings', gate: SEE_CALENDAR },
  { m: 'get', path: '/api/bookings/calendar?from=2030-01-07&to=2030-01-07', gate: SEE_CALENDAR },
  { m: 'get', path: '/api/bookings/mine', gate: 'AUTH' },
  { m: 'post', path: '/api/bookings', gate: BOOK, body: {} },
  { m: 'patch', path: `/api/bookings/${X}/cancel`, gate: [...BOOK, P.FACULTY_PORTAL] },
  { m: 'patch', path: `/api/bookings/${X}`, gate: BOOK, body: {} },
  { m: 'get', path: '/api/bookings/admin/all', gate: ADMIN },
  { m: 'post', path: '/api/bookings/admin/quick', gate: ADMIN, body: {} },
  // facultyRoutes
  { m: 'get', path: '/api/faculty/pending', gate: [P.FACULTY_PORTAL, P.ADMIN] },
  { m: 'patch', path: `/api/faculty/${X}/approve`, gate: [P.FACULTY_PORTAL, P.ADMIN] },
  { m: 'patch', path: `/api/faculty/${X}/reject`, gate: [P.FACULTY_PORTAL, P.ADMIN] },
  // transferRoutes
  { m: 'post', path: '/api/transfers/request', gate: [P.BOOKINGS], body: { booking_id: X } },
  { m: 'get', path: '/api/transfers/incoming', gate: ANSWER },
  { m: 'get', path: '/api/transfers/outgoing', gate: ANSWER },
  { m: 'patch', path: `/api/transfers/${X}/accept`, gate: ANSWER },
  { m: 'patch', path: `/api/transfers/${X}/reject`, gate: ANSWER },
  // adminRoutes
  { m: 'get', path: '/api/admin/export/bookings', gate: ADMIN },
  { m: 'get', path: '/api/admin/audit-logs', gate: ADMIN },
  { m: 'get', path: '/api/admin/analytics', gate: ADMIN },
  { m: 'get', path: '/api/admin/uploads/template/faculty', gate: ADMIN },
  { m: 'get', path: '/api/admin/uploads/template/timetable', gate: ADMIN },
  { m: 'get', path: '/api/admin/uploads/export/students', gate: ADMIN },
  { m: 'get', path: '/api/admin/uploads/export/faculty', gate: ADMIN },
  { m: 'get', path: '/api/admin/uploads/export/timetable', gate: ADMIN },
  { m: 'post', path: '/api/admin/uploads/import/faculty', gate: ADMIN, body: {} },
  { m: 'post', path: '/api/admin/uploads/import/timetable', gate: ADMIN, body: {} },
  { m: 'get', path: '/api/admin/uploads/status/no-such-job', gate: ADMIN },
  // timetableRoutes
  { m: 'get', path: '/api/timetable/search', gate: ADMIN },
  { m: 'get', path: '/api/timetable/autocomplete/faculty', gate: [P.TIMETABLE, P.BOOKINGS, P.ADMIN] },
  { m: 'post', path: '/api/timetable/upload', gate: ADMIN, body: {} },
  { m: 'get', path: '/api/timetable/faculty', gate: [P.TIMETABLE, P.FACULTY_PORTAL] },
  { m: 'get', path: `/api/timetable/faculty/check/${X}`, gate: [P.BOOKINGS, P.BOOKINGS_DIRECT, P.FACULTY_PORTAL, P.ADMIN] },
  { m: 'post', path: '/api/timetable/faculty/override', gate: [P.FACULTY_PORTAL], body: {} },
  { m: 'get', path: '/api/timetable/faculty/overrides', gate: [P.FACULTY_PORTAL] },
  { m: 'get', path: '/api/timetable/cancellation-requests/pending', gate: [P.FACULTY_PORTAL] },
  { m: 'patch', path: `/api/timetable/cancellation-requests/${X}/approve`, gate: [P.FACULTY_PORTAL] },
  { m: 'post', path: '/api/timetable/cancellation-requests', gate: [P.BOOKINGS], body: {} },
  { m: 'get', path: '/api/timetable/slots', gate: ADMIN },
  { m: 'post', path: '/api/timetable/slots', gate: ADMIN, body: {} },
  { m: 'patch', path: `/api/timetable/slots/${X}`, gate: ADMIN, body: {} },
  { m: 'delete', path: `/api/timetable/slots/${X}`, gate: ADMIN },
  { m: 'get', path: '/api/timetable', gate: [P.TIMETABLE] },
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
    // + '/', '/api/health', '/api/permissions/catalog' from server.js (/metrics uses a scraper token, tested separately)
    expect(ROUTES.length).toBe(count + 3);
  });

  // Password-era and promotion endpoints were removed on purpose (identity, roles and profile are
  // owned by Google SSO + the ACL). They must look like unknown routes to everyone: never served
  // (200) and never gated (401/403), which would mean a handler or auth middleware is still mounted.
  const REMOVED = [
    ['get', '/api/timetable/inspect-database'],
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

  const signedIn = ROUTES.filter((r) => r.gate !== 'PUBLIC');
  test.each(signedIn.map((r) => [label(r), r]))('%s: no token → 401', async (_l, r) => {
    expect((await call(r)).status).toBe(401);
  });

  const gated = ROUTES.filter((r) => Array.isArray(r.gate));
  test.each(gated.map((r) => [label(r), r]))('%s: signed in without the permission → 403', async (_l, r) => {
    expect((await call(r, users.none.user, users.none.auth)).status).toBe(403);
  });

  // Every listed permission opens the gate on its own; nothing else does.
  const pairs = gated.flatMap((r) => Object.values(P).map((perm) => [label(r), perm, r.gate.includes(perm), r]));
  test.each(pairs)('%s with only %s → allowed=%s', async (_l, perm, allowed, r) => {
    const u = users[perm];
    const res = await call(r, u.user, u.auth);
    if (allowed) expect([401, 403]).not.toContain(res.status);
    else expect(res.status).toBe(403);
  });

  test.each(ROUTES.filter((r) => r.gate === 'AUTH').map((r) => [label(r), r]))('%s: any signed-in person passes', async (_l, r) => {
    expect([401, 403]).not.toContain((await call(r, users.none.user, users.none.auth)).status);
  });

  test('every permission the code checks is in the catalog, and every catalog entry is used', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') && files.push(path.join(d, e.name))));
    walk(path.resolve(process.cwd(), 'src'));
    const used = new Set();
    for (const f of files.filter((x) => !x.endsWith('permissions.js'))) {
      for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bP\.([A-Z_]+)\b/g)) used.add(m[1]);
    }
    expect([...used].filter((k) => !(k in P))).toEqual([]);
    expect(Object.keys(P).filter((k) => !used.has(k))).toEqual([]);
    expect(CATALOG.map((c) => c.name)).toEqual(Object.values(P));
  });

  test('public routes are reachable without a token', async () => {
    for (const r of ROUTES.filter((x) => x.gate === 'PUBLIC')) {
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

  // SEC-13 (fixed): /metrics needs the scraper's METRICS_TOKEN; it is disabled when unset.
  test('[SEC-13] GET /metrics is disabled (404) when METRICS_TOKEN is unset, even for an admin', async () => {
    delete process.env.METRICS_TOKEN;
    expect((await request(app).get('/metrics')).status).toBe(404);
    expect((await request(app).get('/metrics').set('Authorization', users.ADMIN.auth)).status).toBe(404);
  });

  test('[SEC-13] GET /metrics with METRICS_TOKEN set: no/wrong/user token → 401, scraper token → 200', async () => {
    process.env.METRICS_TOKEN = 'metrics-token-for-tests-0123456789';
    try {
      expect((await request(app).get('/metrics')).status).toBe(401);
      expect((await request(app).get('/metrics').set('Authorization', users.ADMIN.auth)).status).toBe(401);
      const ok = await request(app).get('/metrics').set('Authorization', 'Bearer metrics-token-for-tests-0123456789');
      expect(ok.status).toBe(200);
      expect(ok.text).toMatch(/http_request_duration_seconds/);
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });

  test('[SEC-06] VIEWER cannot request a booking transfer (→ 403)', async () => {
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
    // Demotion happens in the ACL: once cras.admin is withdrawn, access ends at once.
    await grantPermissions(user.id, []);
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
    expect(rows[0].c).toBe(new Set(Object.values(users).map((u) => u.user.id)).size);
  });

  test('[SEC-12] injection in a numeric path param → 4xx without Postgres error text', async () => {
    const res = await request(app).get(`/api/timetable/faculty/check/${encodeURIComponent('1 OR 1=1')}`).set('Authorization', users.STUDENT_REP.auth);
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

  test('[SEC-12] 4xx/5xx bodies never include a stack trace or internal error text', async () => {
    const bodies = [];
    bodies.push((await request(app).post('/api/auth/dev-login').set('Content-Type', 'application/json').send('{"email": ')).body);
    bodies.push((await request(app).post('/api/auth/dev-login').set('Content-Type', 'application/json')
      .send(JSON.stringify({ pad: 'x'.repeat(110 * 1024) }))).body);
    for (const b of bodies) {
      expect(b).not.toHaveProperty('stack');
      expect(JSON.stringify(b)).not.toMatch(/at .*\.js:\d+|is not defined|node_modules/);
    }
  });

  test('[SEC-14] anonymous mutations are not attributed to user id 1 in the audit log', async () => {
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

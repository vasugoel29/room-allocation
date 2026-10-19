// Every /api/admin route: 401 without / with a bad token, 403 for every non-admin role, and no
// side effects for rejected callers. (Removed admin routes are asserted to 404 in security.test.js.)
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createViewer, createRep, createFaculty, tokenFor, closeDb } from '../../test/helpers/factories.js';

const ROUTES = [
  ['get', '/api/admin/export/bookings'],
  ['get', '/api/admin/audit-logs'],
  ['get', '/api/admin/analytics'],
  ['get', '/api/admin/uploads/template/faculty'],
  ['get', '/api/admin/uploads/template/timetable'],
  ['get', '/api/admin/uploads/export/students'],
  ['get', '/api/admin/uploads/export/faculty'],
  ['get', '/api/admin/uploads/export/timetable'],
  ['post', '/api/admin/uploads/import/faculty'],
  ['post', '/api/admin/uploads/import/timetable'],
  ['get', '/api/admin/uploads/status/00000000-0000-0000-0000-000000000000'],
];

const users = {};
beforeAll(async () => {
  users.VIEWER = await createViewer();
  users.STUDENT_REP = await createRep();
  users.FACULTY = await createFaculty();
  users.ADMIN = await createAdmin();
});
afterAll(closeDb);

const call = (method, path, auth) => {
  let req = request(app)[method](path);
  if (auth) req = req.set('Authorization', auth);
  return method === 'post' ? req.send({ csvContent: 'name,email\nX,authz.never@nsut.ac.in\n' }) : req;
};

describe.each(ROUTES)('%s %s', (method, path) => {
  test('401 without a token', async () => {
    const res = await call(method, path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid token' });
  });

  test('401 with a malformed, wrongly signed, or expired token', async () => {
    const forged = jwt.sign({ id: users.ADMIN.user.id, role: 'ADMIN' }, 'not-the-secret');
    const expired = tokenFor(users.ADMIN.user, { expiresIn: -10 });
    for (const auth of ['Bearer garbage', `Bearer ${forged}`, `Bearer ${expired}`]) {
      const res = await call(method, path, auth);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid token' });
    }
    // Not a Bearer scheme at all.
    expect((await call(method, path, `Basic ${users.ADMIN.token}`)).status).toBe(401);
  });

  test.each(['VIEWER', 'STUDENT_REP', 'FACULTY'])('403 for %s', async (role) => {
    const res = await call(method, path, users[role].auth);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});

test('rejected import attempts create no users or faculty-directory entries', async () => {
  expect((await db.query("SELECT 1 FROM users WHERE email = 'authz.never@nsut.ac.in'")).rowCount).toBe(0);
  expect((await db.query("SELECT 1 FROM faculties WHERE lower(email) = 'authz.never@nsut.ac.in'")).rowCount).toBe(0);
});

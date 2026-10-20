// Remaining auth endpoints not covered by sso.test.js: public logout and GET /faculties.
// Sign-in (Google / dev-login), session claims and logout revocation live in sso.test.js; the
// password-era endpoints (signup, password login, forgot/reset password, verify-student) were
// removed and are asserted to 404 in security.test.js.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createViewer, createRep, createFaculty, createFacultyEntry, closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

// ─── Logout ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  test('is public and returns 200', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out successfully' });
  });

  test('an invalid or foreign-signed token is ignored (200, nothing revoked)', async () => {
    const { user, auth } = await createViewer();
    const res = await request(app).post('/api/auth/logout').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(200);
    expect((await db.query('SELECT session_version FROM users WHERE id = $1', [user.id])).rows[0].session_version)
      .toBe(user.session_version);
    expect((await request(app).get('/api/auth/me').set('Authorization', auth)).status).toBe(200);
  });
});

// ─── GET /faculties ─────────────────────────────────────────────────────────
describe('GET /api/auth/faculties', () => {
  test('requires authentication', async () => {
    expect((await request(app).get('/api/auth/faculties')).status).toBe(401);
  });

  test('people who book or review get the ACTIVE faculty directory (faculties.id), without sensitive fields', async () => {
    const { rows: [dept] } = await db.query('SELECT id, name FROM departments WHERE is_active ORDER BY id LIMIT 1');
    const { user: facUser, faculty: linked } = await createFaculty();
    await db.query('UPDATE faculties SET department_id = $1 WHERE id = $2', [dept.id, linked.id]);
    const noAccount = await createFacultyEntry({ department_name: 'Directory Only Dept' });
    const inactive = await createFacultyEntry({ is_active: false });
    // The dropdown is for booking: a calendar-only viewer has no use for it.
    expect((await request(app).get('/api/auth/faculties').set('Authorization', (await createViewer()).auth)).status).toBe(403);
    const { user: viewer, auth } = await createRep();
    const res = await request(app).get('/api/auth/faculties').set('Authorization', auth);
    expect(res.status).toBe(200);
    const ids = res.body.map((f) => f.id);
    expect(ids).toContain(linked.id);
    expect(ids).toContain(noAccount.id); // directory entries need no sign-in account
    expect(ids).not.toContain(inactive.id); // soft-deleted entries are hidden
    expect(ids).not.toContain(facUser.id); // ids are directory ids, never user ids
    expect(ids).not.toContain(viewer.id);
    expect(res.body.find((f) => f.id === linked.id)).toEqual({ id: linked.id, name: linked.name, email: linked.email, department: dept.name });
    expect(res.body.find((f) => f.id === noAccount.id)).toMatchObject({ department: 'Directory Only Dept' });
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });
});

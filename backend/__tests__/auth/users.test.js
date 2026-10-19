// User management: /api/auth/users (GET/POST/PATCH/DELETE) and /api/auth/approve-user/:id.
import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import request from 'supertest';

const notifyFacultyApproved = jest.fn(async () => {});
jest.unstable_mockModule('../../src/utils/emailService.js', () => ({
  sendEmail: jest.fn(async () => {}),
  notifyFacultyNewRequest: jest.fn(async () => {}),
  notifyStudentBookingStatus: jest.fn(async () => {}),
  notifyBookingCancelled: jest.fn(async () => {}),
  notifyFacultyApproved,
  notifyPromotionResult: jest.fn(async () => {}),
  sendPasswordResetEmail: jest.fn(async () => {}),
}));

const { default: app } = await import('../../src/server.js');
const db = await import('../../src/db.js');
const { createAdmin, createFaculty, createRep, createViewer, closeDb } = await import('../../test/helpers/factories.js');

afterAll(closeDb);

let n = 0;
const uniqEmail = (p = 'um') => `${p}.${process.pid}.${Date.now().toString(36)}.${n++}@nsut.ac.in`;
const getUser = async (id) => (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];

let admin;
beforeAll(async () => { admin = await createAdmin(); });

// ─── GET /users ─────────────────────────────────────────────────────────────
describe('GET /api/auth/users', () => {
  test('admin gets paginated {data, meta} without password or reset-token fields', async () => {
    const { user } = await createViewer();
    const res = await request(app).get('/api/auth/users').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
    const { rows: [{ c }] } = await db.query('SELECT count(*)::int AS c FROM users');
    expect(res.body.meta.total).toBe(c);
    expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.total / 20));
    expect(res.body.data.length).toBeLessThanOrEqual(20);
    // Newest first → the user we just created is on page 1.
    const row = res.body.data.find((u) => u.id === user.id);
    expect(row).toMatchObject({ id: user.id, email: user.email, role: 'VIEWER', is_approved: true });
    for (const u of res.body.data) {
      expect(u).not.toHaveProperty('password');
      expect(u).not.toHaveProperty('password_reset_token');
      expect(u).not.toHaveProperty('password_reset_expires');
    }
  });

  test('honours page/limit', async () => {
    await createViewer(); await createViewer();
    const p1 = await request(app).get('/api/auth/users?page=1&limit=2').set('Authorization', admin.auth);
    const p2 = await request(app).get('/api/auth/users?page=2&limit=2').set('Authorization', admin.auth);
    expect(p1.body.data).toHaveLength(2);
    expect(p2.body.meta).toMatchObject({ page: 2, limit: 2 });
    const ids1 = p1.body.data.map((u) => u.id);
    expect(p2.body.data.every((u) => !ids1.includes(u.id))).toBe(true);
  });

  test.each(['VIEWER', 'STUDENT_REP', 'FACULTY'])('%s → 403', async (role) => {
    const { auth } = await { VIEWER: createViewer, STUDENT_REP: createRep, FACULTY: createFaculty }[role]();
    const res = await request(app).get('/api/auth/users').set('Authorization', auth);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  test('no token → 401', async () => {
    expect((await request(app).get('/api/auth/users')).status).toBe(401);
  });
});

// ─── POST /users ────────────────────────────────────────────────────────────
describe('POST /api/auth/users', () => {
  test('admin creates an approved user with a bcrypt password who can log in', async () => {
    const email = uniqEmail();
    const res = await request(app).post('/api/auth/users').set('Authorization', admin.auth)
      .send({ name: 'Admin Made', email, password: 'Created#123', role: 'STUDENT_REP', branch: 'IT', semester: 3, section: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email, role: 'STUDENT_REP', is_approved: true, branch: 'IT', semester: 3, year: 2, section: 2 });
    expect(res.body.password).toBeUndefined();
    const row = await getUser(res.body.id);
    expect(await bcrypt.compare('Created#123', row.password)).toBe(true);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'Created#123' });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('STUDENT_REP');
  });

  test('admin-created FACULTY is approved and has student fields nulled', async () => {
    const res = await request(app).post('/api/auth/users').set('Authorization', admin.auth)
      .send({ name: 'Prof Made', email: uniqEmail('prof'), password: 'Created#123', role: 'FACULTY', branch: 'IT', semester: 3 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'FACULTY', is_approved: true, branch: null, semester: null, year: null });
  });

  test('defaults role to VIEWER', async () => {
    const res = await request(app).post('/api/auth/users').set('Authorization', admin.auth)
      .send({ name: 'Default Role', email: uniqEmail(), password: 'Created#123' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('VIEWER');
  });

  test('missing password → 400', async () => {
    const res = await request(app).post('/api/auth/users').set('Authorization', admin.auth).send({ name: 'X', email: uniqEmail() });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Password is required for user creation' });
  });

  test('duplicate email → 400', async () => {
    const { user } = await createViewer();
    const res = await request(app).post('/api/auth/users').set('Authorization', admin.auth)
      .send({ name: 'Dup', email: user.email, password: 'Created#123' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email already exists' });
  });

  test.failing('[NEW-auth-2] rejects an unknown role (e.g. "GOD") instead of storing it', async () => {
    const email = uniqEmail();
    const res = await request(app).post('/api/auth/users').set('Authorization', admin.auth)
      .send({ name: 'Bad Role', email, password: 'Created#123', role: 'GOD' });
    expect(res.status).toBe(400);
  });

  test.each(['VIEWER', 'STUDENT_REP', 'FACULTY'])('%s → 403 and nothing created', async (role) => {
    const { auth } = await { VIEWER: createViewer, STUDENT_REP: createRep, FACULTY: createFaculty }[role]();
    const email = uniqEmail();
    const res = await request(app).post('/api/auth/users').set('Authorization', auth).send({ name: 'X', email, password: 'Created#123', role: 'ADMIN' });
    expect(res.status).toBe(403);
    expect((await db.query('SELECT 1 FROM users WHERE email = $1', [email])).rows).toHaveLength(0);
  });
});

// ─── PATCH /users/:id ───────────────────────────────────────────────────────
describe('PATCH /api/auth/users/:id', () => {
  const patch = (id, auth, body) => request(app).patch(`/api/auth/users/${id}`).set('Authorization', auth).send(body);

  test('a user can update their own name', async () => {
    const { user, auth } = await createViewer();
    const res = await patch(user.id, auth, { name: 'Renamed Self' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, name: 'Renamed Self' });
    expect(res.body.password).toBeUndefined();
    expect((await getUser(user.id)).name).toBe('Renamed Self');
  });

  test('a non-admin cannot change their own role or approval (fields silently dropped)', async () => {
    const { user, auth } = await createViewer();
    const res = await patch(user.id, auth, { role: 'ADMIN', is_approved: false, name: 'Still Viewer' });
    expect(res.status).toBe(200);
    const row = await getUser(user.id);
    expect(row.role).toBe('VIEWER');
    expect(row.is_approved).toBe(true);
    expect(row.name).toBe('Still Viewer');
  });

  test('a non-admin cannot change their password through this endpoint', async () => {
    const { user, auth } = await createViewer();
    const before = (await getUser(user.id)).password;
    await patch(user.id, auth, { password: 'hijack', passwordHash: 'hijack' });
    expect((await getUser(user.id)).password).toBe(before);
  });

  test.each(['VIEWER', 'STUDENT_REP', 'FACULTY'])('%s cannot update another user → 403', async (role) => {
    const { auth } = await { VIEWER: createViewer, STUDENT_REP: createRep, FACULTY: createFaculty }[role]();
    const { user: victim } = await createViewer();
    const res = await patch(victim.id, auth, { name: 'Pwned' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Not authorized to update this profile' });
    expect((await getUser(victim.id)).name).toBe(victim.name);
  });

  test('admin can change another user\'s role, approval and profile', async () => {
    const { user } = await createViewer();
    const res = await patch(user.id, admin.auth, { role: 'STUDENT_REP', name: 'Promoted By Admin', semester: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'STUDENT_REP', name: 'Promoted By Admin', semester: 5 });
    expect((await getUser(user.id)).role).toBe('STUDENT_REP');
  });

  test('admin departmentName sets department_id', async () => {
    const { rows: [dept] } = await db.query('SELECT id, name FROM departments ORDER BY id LIMIT 1');
    const { user } = await createFaculty();
    const res = await patch(user.id, admin.auth, { departmentName: dept.name });
    expect(res.status).toBe(200);
    expect(res.body.department_id).toBe(dept.id);
  });

  test('admin on a non-existent id → 404', async () => {
    const res = await patch(999999, admin.auth, { name: 'Nobody' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  test('no token → 401', async () => {
    const { user } = await createViewer();
    expect((await request(app).patch(`/api/auth/users/${user.id}`).send({ name: 'x' })).status).toBe(401);
  });

  // QUESTION: COALESCE in userRepository.update means no field can ever be cleared (set back to NULL)
  // via this endpoint — e.g. an admin cannot remove a student's section. Documented as current behaviour.
  test('null values are ignored (fields cannot be cleared)', async () => {
    const { user } = await createViewer({ section: 2 });
    const res = await patch(user.id, admin.auth, { section: null });
    expect(res.status).toBe(200);
    expect((await getUser(user.id)).section).toBe(2);
  });

  test.failing('[SEC-08] a non-admin cannot change their own email', async () => {
    const { user, auth } = await createViewer();
    await patch(user.id, auth, { email: `takeover.${Date.now()}@evil.example` });
    expect((await getUser(user.id)).email).toBe(user.email);
  });

  test.failing('[SEC-08] a non-admin cannot change their own branch/semester/section/group (timetable-clash bypass)', async () => {
    const { user, auth } = await createRep({ semester: 4, section: 1, group_name: 1, branch: 'XX' });
    await patch(user.id, auth, { semester: 8, section: 9, group_name: 2, branch: 'YY', year: 4 });
    const row = await getUser(user.id);
    expect({ semester: row.semester, section: row.section, group_name: row.group_name, branch: row.branch, year: row.year })
      .toEqual({ semester: 4, section: 1, group_name: 1, branch: 'XX', year: user.year });
  });

  test.failing('[SEC-08] a non-admin cannot move themselves into another branch_id', async () => {
    const { rows: [branch] } = await db.query("INSERT INTO branches (name, short_code) VALUES ($1, 'ZZ') RETURNING id", [`Branch ${uniqEmail()}`]);
    const { user, auth } = await createViewer();
    await patch(user.id, auth, { branch_id: branch.id });
    expect((await getUser(user.id)).branch_id).toBeNull();
  });
});

// ─── DELETE /users/:id ──────────────────────────────────────────────────────
describe('DELETE /api/auth/users/:id', () => {
  test('admin deletes a user → 200 and row is gone', async () => {
    const { user } = await createViewer();
    const res = await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'User deleted successfully' });
    expect(await getUser(user.id)).toBeUndefined();
  });

  test('non-existent id → 404', async () => {
    const res = await request(app).delete('/api/auth/users/999999').set('Authorization', admin.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  test.each(['VIEWER', 'STUDENT_REP', 'FACULTY'])('%s → 403, user survives (including self-delete)', async (role) => {
    const { user, auth } = await { VIEWER: createViewer, STUDENT_REP: createRep, FACULTY: createFaculty }[role]();
    const { user: other } = await createViewer();
    expect((await request(app).delete(`/api/auth/users/${other.id}`).set('Authorization', auth)).status).toBe(403);
    expect((await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', auth)).status).toBe(403);
    expect(await getUser(other.id)).toBeDefined();
    expect(await getUser(user.id)).toBeDefined();
  });

  test('deleting a user cascades their pending promotion requests', async () => {
    const { user } = await createViewer();
    await db.query("INSERT INTO promotion_requests (user_id, reason) VALUES ($1, 'cascade me')", [user.id]);
    expect((await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(200);
    expect((await db.query('SELECT 1 FROM promotion_requests WHERE user_id = $1', [user.id])).rows).toHaveLength(0);
  });
});

// ─── PATCH /approve-user/:id ────────────────────────────────────────────────
describe('PATCH /api/auth/approve-user/:id', () => {
  test('admin approves a pending faculty: DB flag flips, notification sent, faculty can log in', async () => {
    const { user } = await createFaculty({ is_approved: false });
    notifyFacultyApproved.mockClear();
    const res = await request(app).patch(`/api/auth/approve-user/${user.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('User approved successfully');
    expect(res.body.user).toMatchObject({ id: user.id, is_approved: true, role: 'FACULTY' });
    expect((await getUser(user.id)).is_approved).toBe(true);
    expect(notifyFacultyApproved).toHaveBeenCalledWith({ facultyEmail: user.email, facultyName: user.name });
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Password@123' });
    expect(login.status).toBe(200);
  });

  test('approving a non-faculty user does not send a faculty notification', async () => {
    const { user } = await createViewer({ is_approved: false });
    notifyFacultyApproved.mockClear();
    const res = await request(app).patch(`/api/auth/approve-user/${user.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(notifyFacultyApproved).not.toHaveBeenCalled();
  });

  test('non-existent id → 404', async () => {
    const res = await request(app).patch('/api/auth/approve-user/999999').set('Authorization', admin.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'User not found' });
  });

  test.each(['VIEWER', 'STUDENT_REP', 'FACULTY'])('%s → 403 and user stays unapproved', async (role) => {
    const { auth } = await { VIEWER: createViewer, STUDENT_REP: createRep, FACULTY: createFaculty }[role]();
    const { user } = await createFaculty({ is_approved: false });
    expect((await request(app).patch(`/api/auth/approve-user/${user.id}`).set('Authorization', auth)).status).toBe(403);
    expect((await getUser(user.id)).is_approved).toBe(false);
  });
});

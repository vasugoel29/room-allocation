// Auth flows: signup, login, logout, forgot/reset password, verify-student proxy, GET /faculties.
// Supersedes __tests__/legacy-auth.test.js (signup viewer/faculty rules, domain check, login, unapproved faculty).
import { jest } from '@jest/globals';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Never send mail: capture password-reset links instead so tests can use the raw token.
const sentResets = [];
const emailMock = {
  sendEmail: jest.fn(async () => {}),
  notifyFacultyNewRequest: jest.fn(async () => {}),
  notifyStudentBookingStatus: jest.fn(async () => {}),
  notifyBookingCancelled: jest.fn(async () => {}),
  notifyFacultyApproved: jest.fn(async () => {}),
  notifyPromotionResult: jest.fn(async () => {}),
  sendPasswordResetEmail: jest.fn(async (args) => { sentResets.push(args); }),
};
jest.unstable_mockModule('../../src/utils/emailService.js', () => emailMock);

const { default: app } = await import('../../src/server.js');
const db = await import('../../src/db.js');
const { createUser, createViewer, createFaculty, createAdmin, closeDb, TEST_PASSWORD } = await import('../../test/helpers/factories.js');

afterAll(closeDb);

let n = 0;
const uniqEmail = (p = 'flow') => `${p}.${process.pid}.${Date.now().toString(36)}.${n++}@nsut.ac.in`;
const getUser = async (email) => (await db.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
const signup = (body) => request(app).post('/api/auth/signup').send(body);
const login = (email, password = TEST_PASSWORD) => request(app).post('/api/auth/login').send({ email, password });

// ─── Signup ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/signup', () => {
  test('registers a student VIEWER: 201, approved, no password in response, bcrypt hash stored', async () => {
    const email = uniqEmail('stud');
    const res = await signup({ name: 'Temp Student', email, password: 'password123', role: 'VIEWER', branch: 'CSE', semester: 6, section: 2, group_name: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email, role: 'VIEWER', is_approved: true, branch: 'CSE', semester: 6, year: 3, section: 2, group_name: 1, message: 'Account created successfully.' });
    expect(res.body.password).toBeUndefined();
    expect(res.body.password_reset_token).toBeUndefined();
    const row = await getUser(email);
    expect(row.password).not.toBe('password123');
    expect(await bcrypt.compare('password123', row.password)).toBe(true);
  });

  test('defaults to VIEWER when role is omitted', async () => {
    const email = uniqEmail();
    const res = await signup({ name: 'No Role', email, password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('VIEWER');
    expect(res.body.is_approved).toBe(true);
  });

  test.each(['ADMIN', 'admin', 'SUPERUSER'])('role %s is not grantable via signup (falls back to VIEWER)', async (role) => {
    const email = uniqEmail();
    const res = await signup({ name: 'Escalator', email, password: 'password123', role });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('VIEWER');
    expect((await getUser(email)).role).toBe('VIEWER');
  });

  test('FACULTY signup is created unapproved, student fields are nulled, approval message returned', async () => {
    const email = uniqEmail('fac');
    const res = await signup({ name: 'Temp Faculty', email, password: 'password123', role: 'FACULTY', branch: 'CSE', semester: 4, section: 1, group_name: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'FACULTY', is_approved: false, branch: null, semester: null, year: null, section: null, group_name: null });
    expect(res.body.message).toMatch(/awaiting administrator approval/i);
    expect((await getUser(email)).is_approved).toBe(false);
  });

  test('departmentName of an existing department links department_id', async () => {
    const { rows: [dept] } = await db.query('SELECT id, name FROM departments ORDER BY id LIMIT 1');
    const email = uniqEmail('fac');
    const res = await signup({ name: 'Dept Faculty', email, password: 'password123', role: 'FACULTY', departmentName: dept.name });
    expect(res.status).toBe(201);
    expect(res.body.department_id).toBe(dept.id);
  });

  test('duplicate email → 400 "Email already exists" and no second row', async () => {
    const email = uniqEmail('dup');
    expect((await signup({ name: 'A', email, password: 'password123' })).status).toBe(201);
    const res = await signup({ name: 'B', email, password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Email already exists' });
    const { rows } = await db.query('SELECT count(*)::int AS c FROM users WHERE email = $1', [email]);
    expect(rows[0].c).toBe(1);
  });

  test.failing('[SEC-02] STUDENT_REP cannot be self-assigned at signup (must go through promotion flow)', async () => {
    const email = uniqEmail('rep');
    const res = await signup({ name: 'Wannabe Rep', email, password: 'password123', role: 'STUDENT_REP' });
    expect(res.status).toBe(201);
    expect((await getUser(email)).role).toBe('VIEWER');
  });

  test.failing('[SEC-03] signup rejects non-@nsut.ac.in email domains', async () => {
    const email = `ext.${Date.now()}${n++}@gmail.com`;
    const res = await signup({ name: 'External User', email, password: 'password123', role: 'VIEWER' });
    expect(res.status).toBe(400);
    expect(await getUser(email)).toBeUndefined();
  });

  test.failing('[SEC-18] emails are normalised: a case-variant of an existing email is a duplicate', async () => {
    const email = uniqEmail('case');
    expect((await signup({ name: 'Lower', email, password: 'password123' })).status).toBe(201);
    const res = await signup({ name: 'Upper', email: email.toUpperCase(), password: 'password123' });
    expect(res.status).toBe(400);
  });

  test.failing('[SEC-19] signup enforces a minimum password strength', async () => {
    const res = await signup({ name: 'Weak', email: uniqEmail('weak'), password: '1' });
    expect(res.status).toBe(400);
  });

  test.failing('[SEC-21] unauthenticated signup cannot create arbitrary departments via departmentName', async () => {
    const deptName = `Department of Junk ${Date.now()}${n++}`;
    await signup({ name: 'Dept Spammer', email: uniqEmail(), password: 'password123', departmentName: deptName });
    const { rows } = await db.query('SELECT 1 FROM departments WHERE name = $1', [deptName]);
    expect(rows).toHaveLength(0);
  });

  // Missing/invalid fields reach bcrypt / Postgres and surface as a generic 500.
  test.failing.each([
    ['password', { name: 'No Pass', email: 'x' }],
    ['email', { name: 'No Email', password: 'password123' }],
    ['name', { email: 'x', password: 'password123' }],
  ])('[NEW-auth-1] missing %s → 400 validation error (not 500)', async (_field, body) => {
    if (body.email === 'x') body.email = uniqEmail('missing');
    const res = await signup(body);
    expect(res.status).toBe(400);
  });

  test.failing('[NEW-auth-1] out-of-range semester → 400 validation error (not 500 from CHECK constraint)', async () => {
    const res = await signup({ name: 'Sem 12', email: uniqEmail(), password: 'password123', semester: 12 });
    expect(res.status).toBe(400);
  });

  test('missing fields currently produce a non-leaky generic 500 (documents current behaviour)', async () => {
    const res = await signup({ name: 'No Pass', email: uniqEmail() });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Signup failed' });
  });
});

// ─── Login ──────────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
  test('success returns token with the documented claims and a password-free user payload', async () => {
    const { rows: [dept] } = await db.query('SELECT id, name FROM departments ORDER BY id LIMIT 1');
    const { user } = await createUser({ role: 'VIEWER', department_id: dept.id, semester: 4, year: 2, section: 3, group_name: 1, branch: 'XX' });
    const res = await login(user.email);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged in successfully');
    expect(res.body.user).toEqual({
      id: user.id, email: user.email, role: 'VIEWER', name: user.name, branch: 'XX', year: 2, semester: 4,
      section: 3, group_name: 1, department_name: dept.name, department_id: dept.id,
    });
    // The session token carries only the subject and session version; role/profile load server-side.
    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(claims).toMatchObject({ sub: String(user.id), sv: 0, typ: 'session' });
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub', 'sv', 'typ']);
    expect(JSON.stringify(res.body)).not.toContain(user.password);
    // The issued token is accepted by authenticated routes.
    const me = await request(app).get('/api/auth/faculties').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  test('[SEC-09] access tokens are short-lived (≤ 24h), not 30 days', async () => {
    const { user } = await createViewer();
    const res = await login(user.email);
    const { iat, exp } = jwt.decode(res.body.token);
    expect(exp - iat).toBeLessThanOrEqual(24 * 3600);
  });

  test('wrong password → 401 "Invalid credentials"', async () => {
    const { user } = await createViewer();
    const res = await login(user.email, 'WrongPassword!1');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
    expect(res.body.token).toBeUndefined();
  });

  test('unknown user → 401 with the same message as a wrong password', async () => {
    const res = await login(uniqEmail('ghost'));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  test('unapproved faculty with correct password → 403 awaiting approval, no token', async () => {
    const { user } = await createFaculty({ is_approved: false });
    const res = await login(user.email);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('awaiting administrator approval');
    expect(res.body.token).toBeUndefined();
  });

  test('faculty who signed up via /signup cannot log in until approved, then can', async () => {
    const email = uniqEmail('fac');
    await signup({ name: 'Pending Prof', email, password: 'password123', role: 'FACULTY' });
    expect((await login(email, 'password123')).status).toBe(403);
    const { auth } = await createAdmin();
    const approve = await request(app).patch(`/api/auth/approve-user/${(await getUser(email)).id}`).set('Authorization', auth);
    expect(approve.status).toBe(200);
    expect((await login(email, 'password123')).status).toBe(200);
  });

  test.failing('[SEC-17] unapproved account with a WRONG password gets 401 (no pending-account enumeration)', async () => {
    const { user } = await createFaculty({ is_approved: false });
    const res = await login(user.email, 'definitely-wrong');
    expect(res.status).toBe(401);
  });

  test.failing('[SEC-18] login is case-insensitive on email', async () => {
    const { user } = await createViewer();
    const res = await login(user.email.toUpperCase());
    expect(res.status).toBe(200);
  });

  test.each([
    [{ password: 'x' }, 'Valid email is required'],
    [{ email: 'not-an-email', password: 'x' }, 'Valid email is required'],
    [{ email: 'a@nsut.ac.in' }, 'Password cannot be empty'],
    [{ email: 'a@nsut.ac.in', password: '' }, 'Password cannot be empty'],
  ])('validation: %j → 400 %s', async (body, msg) => {
    const res = await request(app).post('/api/auth/login').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
    expect(Array.isArray(res.body.details)).toBe(true);
  });
});

// ─── Logout ─────────────────────────────────────────────────────────────────
describe('POST /api/auth/logout', () => {
  test('is public and returns 200', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out successfully' });
  });

  test('[SEC-09] a token is rejected after logout (logout revokes the session)', async () => {
    const { user } = await createViewer();
    const { body: { token } } = await login(user.email);
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`).expect(200);
    const res = await request(app).get('/api/auth/faculties').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

// ─── Forgot / reset password ────────────────────────────────────────────────
describe('password reset', () => {
  const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

  async function requestReset(email) {
    const before = sentResets.length;
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(sentResets.length).toBe(before + 1);
    const { resetLink, userEmail } = sentResets[sentResets.length - 1];
    expect(userEmail).toBe(email);
    return new URL(resetLink).searchParams.get('token');
  }
  const reset = (token, password) => request(app).post('/api/auth/reset-password').send({ token, password });

  test('unknown email → 200 generic message, nothing sent', async () => {
    const before = sentResets.length;
    const res = await request(app).post('/api/auth/forgot-password').send({ email: uniqEmail('nobody') });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account with that email exists, a reset link has been sent.');
    expect(sentResets.length).toBe(before);
  });

  test('known email → same generic 200; only the SHA-256 of the token is stored, expiring in ~1h', async () => {
    const { user } = await createViewer({ name: 'Reset Me' });
    const t0 = Date.now();
    const res = await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account with that email exists, a reset link has been sent.');
    const sent = sentResets[sentResets.length - 1];
    expect(sent.userName).toBe('Reset Me');
    expect(sent.resetLink.startsWith(`${process.env.FRONTEND_URL}/reset-password?token=`)).toBe(true);
    const raw = new URL(sent.resetLink).searchParams.get('token');
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    const row = await getUser(user.email);
    expect(row.password_reset_token).toBe(sha256(raw));
    expect(row.password_reset_token).not.toBe(raw);
    const ttl = new Date(row.password_reset_expires).getTime() - t0;
    expect(ttl).toBeGreaterThan(58 * 60_000);
    expect(ttl).toBeLessThan(62 * 60_000);
  });

  test('valid token resets the password, clears the token, old password stops working', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    const res = await reset(raw, 'BrandNew#Pass9');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset successfully/);
    const row = await getUser(user.email);
    expect(await bcrypt.compare('BrandNew#Pass9', row.password)).toBe(true);
    expect(row.password_reset_token).toBeNull();
    expect(row.password_reset_expires).toBeNull();
    expect((await login(user.email, TEST_PASSWORD)).status).toBe(401);
    expect((await login(user.email, 'BrandNew#Pass9')).status).toBe(200);
  });

  test('token is single-use', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    expect((await reset(raw, 'FirstReset#1')).status).toBe(200);
    const again = await reset(raw, 'SecondReset#2');
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ error: 'Invalid or expired reset token' });
    expect((await login(user.email, 'FirstReset#1')).status).toBe(200);
  });

  test('requesting a new link invalidates the previous token', async () => {
    const { user } = await createViewer();
    const first = await requestReset(user.email);
    const second = await requestReset(user.email);
    expect(first).not.toBe(second);
    expect((await reset(first, 'Whatever#123')).status).toBe(400);
    expect((await reset(second, 'Whatever#123')).status).toBe(200);
  });

  test('wrong token → 400 and the password is unchanged', async () => {
    const { user } = await createViewer();
    await requestReset(user.email);
    const res = await reset(crypto.randomBytes(32).toString('hex'), 'Whatever#123');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid or expired reset token' });
    expect((await login(user.email)).status).toBe(200);
  });

  test('the stored hash itself is not accepted as a token', async () => {
    const { user } = await createViewer();
    await requestReset(user.email);
    const { password_reset_token } = await getUser(user.email);
    expect((await reset(password_reset_token, 'Whatever#123')).status).toBe(400);
  });

  test('expired token → 400', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    await db.query("UPDATE users SET password_reset_expires = NOW() - interval '1 minute' WHERE id = $1", [user.id]);
    const res = await reset(raw, 'Whatever#123');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid or expired reset token' });
  });

  test.each([
    [{ password: 'Whatever#123' }],
    [{ token: 'abc' }],
    [{}],
  ])('missing token/password %j → 400', async (body) => {
    const res = await request(app).post('/api/auth/reset-password').send(body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Token and new password are required' });
  });

  test('password shorter than 6 chars → 400 and token is NOT consumed', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    const res = await reset(raw, '12345');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Password must be at least 6 characters' });
    expect((await getUser(user.email)).password_reset_token).not.toBeNull();
  });

  test.failing('[SEC-19] reset enforces a real password policy (rejects "aaaaaa")', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    expect((await reset(raw, 'aaaaaa')).status).toBe(400);
  });

  test.failing('[SEC-14] audit log does not store the raw reset token', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    expect((await reset(raw, 'AuditMe#123')).status).toBe(200);
    // The audit middleware writes on res 'finish'; give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    const { rows } = await db.query("SELECT details::text AS d FROM audit_logs WHERE details::text LIKE '%' || $1 || '%'", [raw]);
    expect(rows).toHaveLength(0);
  });

  test.failing('[NEW-auth-1] non-string password in reset body → 400 (not 500)', async () => {
    const { user } = await createViewer();
    const raw = await requestReset(user.email);
    const res = await reset(raw, 12345678);
    expect(res.status).toBe(400);
  });
});

// ─── verify-student proxy ───────────────────────────────────────────────────
describe('GET /api/auth/verify-student/:rollNo', () => {
  const realFetch = globalThis.fetch;
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ name: 'Some Student', rollNo: '2021UCS1234' }) }));
    globalThis.fetch = fetchMock;
  });
  afterEach(() => { globalThis.fetch = realFetch; });

  test('proxies to the student API and returns its JSON', async () => {
    const res = await request(app).get('/api/auth/verify-student/2021UCS1234');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ name: 'Some Student', rollNo: '2021UCS1234' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sujal.info/api/nsut/students/2021UCS1234');
  });

  test('roll number shorter than 5 chars → 400 without calling upstream', async () => {
    const res = await request(app).get('/api/auth/verify-student/abcd');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Valid roll number required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('upstream non-OK → 404 "Student not found in database"', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    const res = await request(app).get('/api/auth/verify-student/2021UCS9999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Student not found in database' });
  });

  test('upstream network error → 404 apiDown', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/auth/verify-student/2021UCS9999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Verification service currently offline.', apiDown: true });
  });

  // Express decodes %2F in route params, so "..%2F..%2Fadmin" becomes "../../admin" and is
  // interpolated verbatim: fetch is currently called with
  // "https://api.sujal.info/api/nsut/students/../../admin" (→ /api/admin on the third-party host).
  test.failing('[SEC-07] path traversal in rollNo is rejected and never reaches the upstream URL', async () => {
    const res = await request(app).get('/api/auth/verify-student/..%2F..%2Fadmin%3Fx%3D1');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes('..') || u.includes('?'))).toEqual([]);
    expect(res.status).toBe(400);
  });
});

// ─── GET /faculties ─────────────────────────────────────────────────────────
describe('GET /api/auth/faculties', () => {
  test('requires authentication', async () => {
    expect((await request(app).get('/api/auth/faculties')).status).toBe(401);
  });

  test('any authenticated role gets approved faculty only, without sensitive fields', async () => {
    const { rows: [dept] } = await db.query('SELECT id, name FROM departments ORDER BY id LIMIT 1');
    const { user: approved } = await createFaculty({ department_id: dept.id });
    const { user: pending } = await createFaculty({ is_approved: false });
    const { user: viewer, auth } = await createViewer();
    const res = await request(app).get('/api/auth/faculties').set('Authorization', auth);
    expect(res.status).toBe(200);
    const ids = res.body.map((f) => f.id);
    expect(ids).toContain(approved.id);
    expect(ids).not.toContain(pending.id);
    expect(ids).not.toContain(viewer.id);
    expect(res.body.find((f) => f.id === approved.id)).toEqual({ id: approved.id, name: approved.name, email: approved.email, department: dept.name });
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });
});

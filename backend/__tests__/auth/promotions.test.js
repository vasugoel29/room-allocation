// /api/promotions — VIEWER → STUDENT_REP promotion requests (BKG-15).
import { jest } from '@jest/globals';
import request from 'supertest';

const notifyPromotionResult = jest.fn(async () => {});
jest.unstable_mockModule('../../src/utils/emailService.js', () => ({
  sendEmail: jest.fn(async () => {}),
  notifyFacultyNewRequest: jest.fn(async () => {}),
  notifyStudentBookingStatus: jest.fn(async () => {}),
  notifyBookingCancelled: jest.fn(async () => {}),
  notifyFacultyApproved: jest.fn(async () => {}),
  notifyPromotionResult,
  sendPasswordResetEmail: jest.fn(async () => {}),
}));

const { default: app } = await import('../../src/server.js');
const db = await import('../../src/db.js');
const { createAdmin, createFaculty, createRep, createViewer, closeDb } = await import('../../test/helpers/factories.js');

afterAll(closeDb);

const insertRequest = async (user_id, { status = 'PENDING', reason = 'I am the class rep' } = {}) =>
  (await db.query('INSERT INTO promotion_requests (user_id, reason, status) VALUES ($1, $2, $3) RETURNING *', [user_id, reason, status])).rows[0];
const getReq = async (id) => (await db.query('SELECT * FROM promotion_requests WHERE id = $1', [id])).rows[0];
const roleOf = async (id) => (await db.query('SELECT role FROM users WHERE id = $1', [id])).rows[0].role;

let admin;
beforeAll(async () => { admin = await createAdmin(); });
const act = (id, body, auth = admin.auth) => request(app).patch(`/api/promotions/${id}`).set('Authorization', auth).send(body);

describe('POST /api/promotions', () => {
  test('no token → 401', async () => {
    expect((await request(app).post('/api/promotions').send({ reason: 'x' })).status).toBe(401);
  });

  // requestPromotion references undeclared `reason`/`userId` → ReferenceError → 500 on every call.
  test.failing('[BKG-15] a VIEWER can submit a promotion request (201, PENDING row stored)', async () => {
    const { user, auth } = await createViewer();
    const res = await request(app).post('/api/promotions').set('Authorization', auth).send({ reason: 'Elected class representative' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ user_id: user.id, status: 'PENDING', reason: 'Elected class representative' });
  });

  test.failing('[BKG-15] missing reason → 400', async () => {
    const { auth } = await createViewer();
    const res = await request(app).post('/api/promotions').set('Authorization', auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Reason is required/);
  });

  test.failing('[BKG-15] a second pending request → 400 "already have a pending promotion request"', async () => {
    const { user, auth } = await createViewer();
    await insertRequest(user.id);
    const res = await request(app).post('/api/promotions').set('Authorization', auth).send({ reason: 'again' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already have a pending/);
  });
});

describe('GET /api/promotions/me', () => {
  test('returns null when the user has never asked', async () => {
    const { auth } = await createViewer();
    const res = await request(app).get('/api/promotions/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('returns only the caller\'s most recent request', async () => {
    const { user, auth } = await createViewer();
    const { user: other } = await createViewer();
    await insertRequest(other.id, { reason: 'not mine' });
    await insertRequest(user.id, { status: 'REJECTED', reason: 'old' });
    await new Promise((r) => setTimeout(r, 10));
    const latest = await insertRequest(user.id, { reason: 'new' });
    const res = await request(app).get('/api/promotions/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: latest.id, user_id: user.id, reason: 'new', status: 'PENDING' });
  });
});

describe('GET /api/promotions (admin)', () => {
  test('admin lists all requests with requester name/email', async () => {
    const { user } = await createViewer();
    const reqRow = await insertRequest(user.id);
    const res = await request(app).get('/api/promotions').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find((r) => r.id === reqRow.id)).toMatchObject({ user_id: user.id, user_name: user.name, user_email: user.email, status: 'PENDING' });
  });

  test('page & limit → {data, meta}', async () => {
    const { user } = await createViewer();
    await insertRequest(user.id);
    const res = await request(app).get('/api/promotions?page=1&limit=1').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const { rows: [{ c }] } = await db.query('SELECT count(*)::int AS c FROM promotion_requests');
    expect(res.body.meta).toEqual({ total: c, page: 1, limit: 1, totalPages: c });
  });

  test.each([['VIEWER', createViewer], ['STUDENT_REP', createRep], ['FACULTY', createFaculty]])('%s → 403', async (_r, make) => {
    const { auth } = await make();
    expect((await request(app).get('/api/promotions').set('Authorization', auth)).status).toBe(403);
  });
});

describe('PATCH /api/promotions/:id (admin)', () => {
  test('APPROVED: request updated, user becomes STUDENT_REP, audit row + notification', async () => {
    const { user } = await createViewer();
    const r = await insertRequest(user.id);
    notifyPromotionResult.mockClear();
    const res = await act(r.id, { status: 'APPROVED', admin_comment: 'Welcome' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Request approved successfully' });
    expect(await getReq(r.id)).toMatchObject({ status: 'APPROVED', admin_comment: 'Welcome' });
    expect(await roleOf(user.id)).toBe('STUDENT_REP');
    const { rows } = await db.query("SELECT * FROM audit_logs WHERE action = 'APPROVE_PROMOTION' AND entity_id = $1", [r.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(admin.user.id);
    expect(notifyPromotionResult).toHaveBeenCalledWith({ userEmail: user.email, userName: user.name, status: 'APPROVED', adminComment: 'Welcome' });
  });

  test('REJECTED: request updated, role unchanged', async () => {
    const { user } = await createViewer();
    const r = await insertRequest(user.id);
    const res = await act(r.id, { status: 'REJECTED', admin_comment: 'Not now' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Request rejected successfully' });
    expect(await getReq(r.id)).toMatchObject({ status: 'REJECTED', admin_comment: 'Not now' });
    expect(await roleOf(user.id)).toBe('VIEWER');
  });

  test.each([[{}], [{ status: 'PENDING' }], [{ status: 'approved' }]])('invalid status %j → 400', async (body) => {
    const { user } = await createViewer();
    const r = await insertRequest(user.id);
    const res = await act(r.id, body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid status' });
    expect((await getReq(r.id)).status).toBe('PENDING');
  });

  test('admin_comment over 100 chars → 400', async () => {
    const { user } = await createViewer();
    const r = await insertRequest(user.id);
    const res = await act(r.id, { status: 'REJECTED', admin_comment: 'x'.repeat(101) });
    expect(res.status).toBe(400);
    expect((await getReq(r.id)).status).toBe('PENDING');
  });

  test('non-existent request → 404', async () => {
    const res = await act(999999, { status: 'APPROVED' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Request not found' });
  });

  test.each([['VIEWER', createViewer], ['STUDENT_REP', createRep], ['FACULTY', createFaculty]])('%s → 403 and nothing changes', async (_r, make) => {
    const { auth, user: actor } = await make();
    const r = await insertRequest(actor.id);
    expect((await act(r.id, { status: 'APPROVED' }, auth)).status).toBe(403);
    expect((await getReq(r.id)).status).toBe('PENDING');
    expect(await roleOf(actor.id)).toBe(actor.role);
  });

  test.failing('[BKG-15] an already-REJECTED request cannot be approved', async () => {
    const { user } = await createViewer();
    const r = await insertRequest(user.id, { status: 'REJECTED' });
    const res = await act(r.id, { status: 'APPROVED' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await roleOf(user.id)).toBe('VIEWER');
  });

  test.failing('[BKG-15] approving a stale request never demotes a FACULTY user', async () => {
    const { user } = await createFaculty();
    const r = await insertRequest(user.id);
    await act(r.id, { status: 'APPROVED' });
    expect(await roleOf(user.id)).toBe('FACULTY');
  });

  test.failing('[BKG-15] approving a stale request never demotes an ADMIN user', async () => {
    const { user } = await createAdmin();
    const r = await insertRequest(user.id);
    await act(r.id, { status: 'APPROVED' });
    expect(await roleOf(user.id)).toBe('ADMIN');
  });

  // UNIQUE(user_id, status) on promotion_requests → second REJECTED for the same user violates it.
  test.failing('[BKG-15] rejecting a user\'s second request succeeds (not 500)', async () => {
    const { user } = await createViewer();
    await insertRequest(user.id, { status: 'REJECTED', reason: 'first' });
    const second = await insertRequest(user.id, { reason: 'second' });
    const res = await act(second.id, { status: 'REJECTED' });
    expect(res.status).toBe(200);
    expect((await getReq(second.id)).status).toBe('REJECTED');
  });
});

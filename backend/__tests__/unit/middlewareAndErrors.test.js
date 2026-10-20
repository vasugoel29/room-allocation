// Unit tests with mock req/res for: src/middleware/auth.js (authenticate, requirePermission),
// src/middleware/validate.js (validateRequest) and src/utils/httpErrors.js.
import jwt from 'jsonwebtoken';
import { body, query } from 'express-validator';
import { authenticate, requirePermission, JWT_SECRET } from '../../src/middleware/auth.js';
import { validateRequest } from '../../src/middleware/validate.js';
import { sendError, sendServerError } from '../../src/utils/httpErrors.js';
import { createFaculty, closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

/** Runs a middleware and reports whether next() was called (and with what). */
function run(mw, req) {
  const res = mockRes();
  const out = { res, nextCalled: false, nextArg: undefined };
  out.ret = mw(req, res, (arg) => { out.nextCalled = true; out.nextArg = arg; });
  return out;
}

describe('authenticate', () => {
  test('uses the JWT_SECRET from the environment', () => {
    expect(JWT_SECRET).toBe(process.env.JWT_SECRET);
  });

  test('valid session token -> req.user is the principal loaded from the database', async () => {
    const { user } = await createFaculty();
    // Claims other than sub/sv are ignored: the role comes from the database, not the token.
    const token = jwt.sign({ sub: String(user.id), sv: 0, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const out = run(authenticate, req);
    await out.ret;
    expect(out.nextCalled).toBe(true);
    expect(out.nextArg).toBeUndefined();
    expect(out.res.body).toBeUndefined();
    expect(req.user).toMatchObject({ id: user.id, role: 'FACULTY', email: user.email });
    expect(req.user.permissions.has('cras.faculty_portal')).toBe(true);
  });

  test('token for a user that does not exist -> 401', async () => {
    const token = jwt.sign({ sub: '99999999', sv: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const out = run(authenticate, req);
    await out.ret;
    expect(out.nextCalled).toBe(false);
    expect(out.res.statusCode).toBe(401);
  });

  test.each([
    ['no header', {}],
    ['empty header', { authorization: '' }],
    ['lower-case scheme', { authorization: 'bearer abc' }],
    ['Basic scheme', { authorization: 'Basic dXNlcjpwYXNz' }],
    ['scheme without token', { authorization: 'Bearer' }],
  ])('%s -> 401 Missing or invalid token', (_label, headers) => {
    const { res, nextCalled } = run(authenticate, { headers });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid token' });
  });

  test.each([
    ['garbage', () => 'not.a.jwt'],
    ['empty token after scheme', () => ''],
    ['wrong secret', () => jwt.sign({ id: 1, role: 'ADMIN' }, 'some-other-secret')],
    ['expired', () => jwt.sign({ id: 1, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: -1 })],
    ['alg=none', () => jwt.sign({ id: 1, role: 'ADMIN' }, null, { algorithm: 'none' })],
  ])('%s -> 401 Invalid token', (_label, makeToken) => {
    const req = { headers: { authorization: `Bearer ${makeToken()}` } };
    const { res, nextCalled } = run(authenticate, req);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid token' });
    expect(req.user).toBeUndefined();
  });
});

describe('requirePermission', () => {
  test('passes with any one of the listed permissions; 403 otherwise', () => {
    const gate = requirePermission('cras.bookings', 'cras.admin');
    expect(run(gate, { user: { permissions: ['cras.admin'] } }).nextCalled).toBe(true);
    expect(run(gate, { user: { permissions: new Set(['cras.bookings']) } }).nextCalled).toBe(true);
    const denied = run(gate, { user: { permissions: ['cras.calendar'] } });
    expect(denied.nextCalled).toBe(false);
    expect(denied.res.statusCode).toBe(403);
    expect(denied.res.body).toEqual({ error: 'Forbidden' });
  });

  test('a role alone grants nothing (ADMIN role, no permissions → 403)', () => {
    const { res, nextCalled } = run(requirePermission('cras.admin'), { user: { role: 'ADMIN', permissions: [] } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('defining a gate without a permission throws', () => {
    expect(() => requirePermission()).toThrow(/permission is required/);
    expect(() => requirePermission(undefined)).toThrow(/permission is required/);
  });

  test('without authenticate (no req.user) it fails closed with 401', () => {
    const { res, nextCalled } = run(requirePermission('cras.calendar'), {});
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe('validateRequest', () => {
  test('no validation errors -> next()', async () => {
    const req = { body: { email: 'a@nsut.ac.in' } };
    await body('email').isEmail().withMessage('Valid email is required').run(req);
    const { res, nextCalled } = run(validateRequest, req);
    expect(nextCalled).toBe(true);
    expect(res.body).toBeUndefined();
  });

  test('errors -> 400 with the first message and full details', async () => {
    const req = { body: { email: 'nope', password: '' } };
    await body('email').isEmail().withMessage('Valid email is required').run(req);
    await body('password').notEmpty().withMessage('Password cannot be empty').run(req);
    const { res, nextCalled } = run(validateRequest, req);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Valid email is required');
    expect(res.body.details).toHaveLength(2);
    expect(res.body.details.map((d) => d.path)).toEqual(['email', 'password']);
  });

  test('falls back to the validator default message when none is configured', async () => {
    const req = { query: { page: 'x' } };
    await query('page').isInt().run(req);
    const { res } = run(validateRequest, req);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Invalid value');
  });

  test('a request that never ran validators passes through', () => {
    const { nextCalled } = run(validateRequest, { body: {} });
    expect(nextCalled).toBe(true);
  });
});

describe('httpErrors', () => {
  test('sendError sets status and { error } body', () => {
    const res = mockRes();
    const ret = sendError(res, 404, 'Room not found');
    expect(ret).toBe(res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Room not found' });
  });

  test('sendServerError falls back to the default message when the error has none', () => {
    const res = mockRes();
    sendServerError(res, null, 'Failed to fetch branches');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to fetch branches' });
    sendServerError(res, undefined);
    expect(res.body).toEqual({ error: 'Something went wrong on our side. Please try again.' });
  });

  // Regression: sendServerError used to return err.message verbatim (DB internals reached clients).
  test('[SEC-12] sendServerError does not leak the raw error message to the client', () => {
    const res = mockRes();
    sendServerError(res, new Error('duplicate key value violates unique constraint "branches_name_department_id_key"'), 'Failed to create branch');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to create branch' });
  });
});

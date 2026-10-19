// Unit tests with mock req/res for: src/middleware/auth.js (authenticate, requireRole),
// src/middleware/validate.js (validateRequest) and src/utils/httpErrors.js.
import jwt from 'jsonwebtoken';
import { body, query } from 'express-validator';
import { authenticate, requireRole, JWT_SECRET } from '../../src/middleware/auth.js';
import { validateRequest } from '../../src/middleware/validate.js';
import { sendError, sendServerError } from '../../src/utils/httpErrors.js';

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

/** Runs a middleware and reports whether next() was called (and with what). */
function run(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  let nextArg;
  const ret = mw(req, res, (arg) => { nextCalled = true; nextArg = arg; });
  return { res, nextCalled, nextArg, ret };
}

describe('authenticate', () => {
  test('uses the JWT_SECRET from the environment', () => {
    expect(JWT_SECRET).toBe(process.env.JWT_SECRET);
  });

  test('valid Bearer token -> req.user is the decoded payload and next() is called', () => {
    const token = jwt.sign({ id: 42, role: 'FACULTY', email: 'f@nsut.ac.in' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const { res, nextCalled, nextArg } = run(authenticate, req);
    expect(nextCalled).toBe(true);
    expect(nextArg).toBeUndefined();
    expect(res.body).toBeUndefined();
    expect(req.user).toMatchObject({ id: 42, role: 'FACULTY', email: 'f@nsut.ac.in' });
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

describe('requireRole', () => {
  const ROLES = ['VIEWER', 'STUDENT_REP', 'FACULTY', 'ADMIN'];

  test.each(ROLES.flatMap((required, ri) => ROLES.map((actual, ai) => [actual, required, ai >= ri])))(
    'user %s on requireRole(%s) -> allowed=%s',
    (actual, required, allowed) => {
      const { res, nextCalled } = run(requireRole(required), { user: { role: actual } });
      expect(nextCalled).toBe(allowed);
      if (!allowed) {
        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({ error: 'Forbidden' });
      }
    },
  );

  test.each([['admin'], ['SUPERUSER'], [undefined]])('an unknown user role (%p) is treated as lowest -> 403 even for VIEWER routes', (role) => {
    const { res, nextCalled } = run(requireRole('VIEWER'), { user: { role } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  // requiredRoleValue falls back to 0 for an unknown name, so a typo like requireRole('Admin')
  // lets every authenticated user (even one with no role) through. All current routes use valid
  // names, so this is latent.
  test.failing('[NEW-admin-7] requireRole with an unknown/misspelt role name fails closed', () => {
    const { nextCalled, res } = run(requireRole('Admin'), { user: { role: 'VIEWER' } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  test('without authenticate (no req.user) it throws rather than silently allowing', () => {
    expect(() => run(requireRole('VIEWER'), {})).toThrow(TypeError);
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
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  // sendServerError returns err.message verbatim, so DB internals (constraint/table names, SQL
  // fragments) reach the client.
  test.failing('[SEC-12] sendServerError does not leak the raw error message to the client', () => {
    const res = mockRes();
    sendServerError(res, new Error('duplicate key value violates unique constraint "branches_name_department_id_key"'), 'Failed to create branch');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to create branch' });
  });
});

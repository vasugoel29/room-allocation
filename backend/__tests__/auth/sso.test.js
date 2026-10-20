// Google SSO + ACL sign-in, server-side sessions and the permission policy.
// The ACL runs in mock mode (test-env.js) and Google signature checks are stubbed through
// setGoogleVerifier, so every branch can be exercised offline.
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { mockAcl } from '../../src/auth/aclClient.js';
import { setGoogleVerifier } from '../../src/auth/google.js';
import { effectivePermissions, hasPermission, normalizeRole, PERMISSIONS as P } from '../../src/auth/permissions.js';
import { createViewer, createAdmin, createFacultyEntry, closeDb } from '../../test/helpers/factories.js';

let seq = 0;
const uniqEmail = (tag) => `sso.${tag}.${process.pid}.${Date.now().toString(36)}${seq++}@nsut.ac.in`;

/** An ACL /v1/user-access response in the real shape (see the live sample in FINDINGS / session notes). */
function aclEntry(email, { role = 'STUDENT_REP', permissions = ['cras.calendar', 'cras.timetable', 'cras.bookings'], status = 'ACTIVE', academic = {}, id } = {}) {
  return {
    user: {
      id: id || `usr_${email.split('@')[0].replace(/\W/g, '')}`.slice(0, 60),
      name: 'SSO TEST USER',
      email,
      type: role === 'FACULTY' ? 'FACULTY' : 'STUDENT',
      status,
      academic: { dept: 'INFORMATION TECHNOLOGY', branch: 'INFORMATION TECHNOLOGY', year: 3, semester: 6, section: 2, group_no: 1, ...academic },
    },
    app: 'CRAS',
    role,
    roles: [role],
    permissions,
    allowed_scope: {},
    scopes_by_permission: {},
  };
}

const googlePayload = (email, extra = {}) => ({ email, email_verified: true, hd: 'nsut.ac.in', name: 'SSO', sub: 'g-' + email, ...extra });

const devLogin = (email) => request(app).post('/api/auth/dev-login').send({ email });
const me = (token) => request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

afterEach(() => {
  setGoogleVerifier(null);
  delete process.env.ACL_REFRESH_SECONDS;
});
afterAll(async () => {
  mockAcl.clear();
  await closeDb();
});

describe('POST /api/auth/google', () => {
  test('a verified @nsut.ac.in Google token + ACL entry signs the user in', async () => {
    const email = uniqEmail('g');
    mockAcl.set(email, aclEntry(email));
    let seenToken;
    setGoogleVerifier(async (t) => { seenToken = t; return googlePayload(email); });

    const res = await request(app).post('/api/auth/google').send({ credential: 'google-id-token' });
    expect(res.status).toBe(200);
    expect(seenToken).toBe('google-id-token');
    expect(res.body.user).toMatchObject({ email, role: 'STUDENT_REP', branch: 'INFORMATION TECHNOLOGY', year: 3, semester: 6, section: 2 });
    expect(res.body.user.permissions.sort()).toEqual(['cras.bookings', 'cras.calendar', 'cras.timetable']);
    expect(JSON.stringify(res.body)).not.toMatch(/mobile|password/i);

    const claims = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sub', 'sv', 'typ']);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(24 * 3600);

    const { rows: [u] } = await db.query('SELECT acl_id, role, password FROM users WHERE email = $1', [email]);
    expect(u).toMatchObject({ role: 'STUDENT_REP', password: null });
    expect(u.acl_id).toMatch(/^usr_/);
  });

  test('[ACL-01] an email without a Google credential is refused (no email-only login)', async () => {
    const email = uniqEmail('bypass');
    mockAcl.set(email, aclEntry(email, { role: 'ADMIN' }));
    const res = await request(app).post('/api/auth/google').send({ email });
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  test('[ACL-01] an unsigned / forged Google token is refused', async () => {
    // The real verifier runs here: a self-made JWT never passes Google signature verification.
    const forged = jwt.sign({ email: uniqEmail('forged'), email_verified: true, hd: 'nsut.ac.in' }, 'not-google');
    const res = await request(app).post('/api/auth/google').send({ credential: forged });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test.each([
    ['personal gmail', { email: 'someone@gmail.com', hd: undefined }],
    ['hd spoofed but email off-domain', { email: 'someone@gmail.com', hd: 'nsut.ac.in' }],
    ['other Workspace domain', { email: 'x@nsit.ac.in', hd: 'nsit.ac.in' }],
  ])('%s → 403', async (_label, over) => {
    setGoogleVerifier(async () => googlePayload(over.email, over));
    const res = await request(app).post('/api/auth/google').send({ credential: 't' });
    expect(res.status).toBe(403);
  });

  test('unverified Google email → 403', async () => {
    setGoogleVerifier(async () => googlePayload(uniqEmail('unv'), { email_verified: false }));
    expect((await request(app).post('/api/auth/google').send({ credential: 't' })).status).toBe(403);
  });

  test('valid Google account that is not in the ACL directory → 403', async () => {
    setGoogleVerifier(async () => googlePayload(uniqEmail('notinacl')));
    const res = await request(app).post('/api/auth/google').send({ credential: 't' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/not registered/i);
  });

  test('ACL account not ACTIVE → 403', async () => {
    const email = uniqEmail('susp');
    mockAcl.set(email, aclEntry(email, { status: 'SUSPENDED' }));
    setGoogleVerifier(async () => googlePayload(email));
    const res = await request(app).post('/api/auth/google').send({ credential: 't' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/SUSPENDED/);
  });

  test('ACL unreachable → 503, no session', async () => {
    const email = uniqEmail('down');
    mockAcl.fail(email, 'unavailable');
    setGoogleVerifier(async () => googlePayload(email));
    const res = await request(app).post('/api/auth/google').send({ credential: 't' });
    expect(res.status).toBe(503);
    expect(res.body.token).toBeUndefined();
  });

  test('server without GOOGLE_CLIENT_ID → 503 (not configured)', async () => {
    const saved = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;
    try {
      const res = await request(app).post('/api/auth/google').send({ credential: 'x.y.z' });
      expect(res.status).toBe(503);
    } finally {
      process.env.GOOGLE_CLIENT_ID = saved;
    }
  });
});

describe('POST /api/auth/dev-login', () => {
  test('signs in through the ACL when enabled', async () => {
    const email = uniqEmail('dev');
    mockAcl.set(email, aclEntry(email, { role: 'FACULTY', permissions: ['cras.faculty_portal'] }));
    const res = await devLogin(email);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email, role: 'FACULTY' });
    expect((await me(res.body.token)).body.user.permissions).toEqual(['cras.faculty_portal']);
  });

  test('is disabled unless AUTH_DEV_LOGIN=true (looks like a missing route)', async () => {
    process.env.AUTH_DEV_LOGIN = 'false';
    try {
      expect((await devLogin(uniqEmail('off'))).status).toBe(404);
    } finally {
      process.env.AUTH_DEV_LOGIN = 'true';
    }
  });

  test('is refused in production even when the flag is set', async () => {
    process.env.NODE_ENV = 'production';
    try {
      expect((await devLogin(uniqEmail('prod'))).status).toBe(404);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  test('still requires an ACL entry', async () => {
    expect((await devLogin(uniqEmail('nobody'))).status).toBe(403);
  });

  test('email is normalised; an existing local account with that email is linked, not duplicated', async () => {
    const { user } = await createViewer();
    mockAcl.set(user.email, aclEntry(user.email, { role: 'STUDENT_REP' }));
    const res = await devLogin(user.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    const { rows } = await db.query('SELECT count(*)::int AS c FROM users WHERE lower(email) = $1', [user.email]);
    expect(rows[0].c).toBe(1);
  });

  test('out-of-range academic values from the ACL are stored as null instead of failing sign-in', async () => {
    const email = uniqEmail('acad');
    mockAcl.set(email, aclEntry(email, { academic: { section: null, year: 9, semester: 'VIII', group_no: null } }));
    const res = await devLogin(email);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ section: null, year: null, semester: null });
  });
});

describe('soft-deleted accounts and the faculty directory', () => {
  test('a soft-deleted (deactivated) account cannot sign in again, even with a valid ACL entry', async () => {
    const email = uniqEmail('softdel');
    mockAcl.set(email, aclEntry(email));
    const first = await devLogin(email);
    expect(first.status).toBe(200);
    const admin = await createAdmin();
    expect((await request(app).delete(`/api/auth/users/${first.body.user.id}`).set('Authorization', admin.auth)).status).toBe(200);

    expect((await me(first.body.token)).status).toBe(401); // existing session ends
    const again = await devLogin(email);
    expect(again.status).toBe(403);
    expect(again.body).toEqual({ error: 'Your CRAS account has been deactivated. Contact the administrator.' });
    expect(again.body.token).toBeUndefined();

    setGoogleVerifier(async () => googlePayload(email));
    const g = await request(app).post('/api/auth/google').send({ credential: 'google-id-token' });
    expect(g.status).toBe(403);
    expect(g.body.token).toBeUndefined();
    // No second account is created.
    const { rows } = await db.query('SELECT is_active FROM users WHERE lower(email) = $1', [email]);
    expect(rows).toEqual([{ is_active: false }]);
  });

  test('signing in links the active faculty-directory entry with that email; principal.faculty_id is the directory id', async () => {
    const email = uniqEmail('facdir');
    const entry = await createFacultyEntry({ email });
    mockAcl.set(email, aclEntry(email, { role: 'FACULTY', permissions: [] }));
    const res = await devLogin(email);
    expect(res.status).toBe(200);
    expect((await me(res.body.token)).body.user.faculty_id).toBe(entry.id);
    const { rows: [f] } = await db.query('SELECT user_id FROM faculties WHERE id = $1', [entry.id]);
    expect(f.user_id).toBe(res.body.user.id);
  });

  test('an inactive directory entry is not linked; principal.faculty_id is null', async () => {
    const email = uniqEmail('facoff');
    const entry = await createFacultyEntry({ email, is_active: false });
    mockAcl.set(email, aclEntry(email, { role: 'FACULTY', permissions: [] }));
    const res = await devLogin(email);
    expect(res.status).toBe(200);
    expect((await me(res.body.token)).body.user.faculty_id).toBeNull();
    expect((await db.query('SELECT user_id FROM faculties WHERE id = $1', [entry.id])).rows[0].user_id).toBeNull();
  });
});

describe('sessions follow the ACL', () => {
  test('a role change in the ACL applies at the next refresh', async () => {
    const email = uniqEmail('promo');
    mockAcl.set(email, aclEntry(email, { role: 'VIEWER', permissions: ['cras.calendar'] }));
    const { token } = (await devLogin(email)).body;
    expect((await me(token)).body.user.role).toBe('VIEWER');

    mockAcl.set(email, aclEntry(email, { role: 'STUDENT_REP' }));
    expect((await me(token)).body.user.role).toBe('VIEWER'); // snapshot still fresh
    process.env.ACL_REFRESH_SECONDS = '0';
    const after = await me(token);
    expect(after.body.user.role).toBe('STUDENT_REP');
  });

  test('removal from the ACL ends the session at the next refresh', async () => {
    const email = uniqEmail('gone');
    mockAcl.set(email, aclEntry(email));
    const { token } = (await devLogin(email)).body;
    mockAcl.delete(email);
    process.env.ACL_REFRESH_SECONDS = '0';
    expect((await me(token)).status).toBe(401);
  });

  test('deactivation in the ACL ends the session at the next refresh', async () => {
    const email = uniqEmail('deact');
    mockAcl.set(email, aclEntry(email));
    const { token } = (await devLogin(email)).body;
    mockAcl.set(email, aclEntry(email, { status: 'INACTIVE' }));
    process.env.ACL_REFRESH_SECONDS = '0';
    expect((await me(token)).status).toBe(401);
  });

  test('ACL outage during refresh keeps a recent snapshot working', async () => {
    const email = uniqEmail('outage');
    mockAcl.set(email, aclEntry(email));
    const { token } = (await devLogin(email)).body;
    mockAcl.fail(email, 'unavailable');
    process.env.ACL_REFRESH_SECONDS = '0';
    const res = await me(token);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('STUDENT_REP');
  });

  test('ACL outage with a snapshot older than ACL_MAX_STALE_SECONDS → 503', async () => {
    const email = uniqEmail('stale');
    mockAcl.set(email, aclEntry(email));
    const { token, user } = (await devLogin(email)).body;
    await db.query(`UPDATE user_access SET fetched_at = NOW() - interval '2 days' WHERE user_id = $1`, [user.id]);
    mockAcl.fail(email, 'unavailable');
    expect((await me(token)).status).toBe(503);
  });

  test('logout revokes every token of that user', async () => {
    const email = uniqEmail('logout');
    mockAcl.set(email, aclEntry(email));
    const a = (await devLogin(email)).body.token;
    const b = (await devLogin(email)).body.token;
    expect((await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${a}`)).status).toBe(200);
    expect((await me(a)).status).toBe(401);
    expect((await me(b)).status).toBe(401);
    // A fresh sign-in works again.
    expect((await me((await devLogin(email)).body.token)).status).toBe(200);
  });

  test('permissions granted by the ACL open the matching routes', async () => {
    const email = uniqEmail('grant');
    // The role is only a label: a VIEWER the ACL grants cras.admin can use the Admin Console...
    mockAcl.set(email, aclEntry(email, { role: 'VIEWER', permissions: ['cras.admin'] }));
    const { token } = (await devLogin(email)).body;
    expect((await request(app).get('/api/admin/audit-logs').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    // ...but nothing it wasn't granted (its own timetable needs cras.timetable).
    expect((await request(app).get('/api/timetable').set('Authorization', `Bearer ${token}`)).status).toBe(403);

    // ...and an ADMIN role with no grants can do nothing gated.
    const bare = uniqEmail('bare');
    mockAcl.set(bare, aclEntry(bare, { role: 'ADMIN', permissions: [] }));
    const t2 = (await devLogin(bare)).body.token;
    expect((await request(app).get('/api/admin/audit-logs').set('Authorization', `Bearer ${t2}`)).status).toBe(403);
  });
});

describe('permission policy', () => {
  test('roles normalise; unknown → VIEWER', () => {
    expect(normalizeRole('student_rep')).toBe('STUDENT_REP');
    expect(normalizeRole('GOD')).toBe('VIEWER');
    expect(normalizeRole(undefined)).toBe('VIEWER');
  });

  test('a role grants nothing; only catalog names the ACL sends count, unknown names are ignored', () => {
    expect([...effectivePermissions([])]).toEqual([]);
    expect([...effectivePermissions(['cras.bookings', 'rooms:book', '*', 'cras.admin '])]).toEqual(['cras.bookings']);
    expect(hasPermission({ permissions: effectivePermissions(['cras.admin']) }, P.ADMIN)).toBe(true);
    expect(hasPermission({ permissions: effectivePermissions(['cras.admin']) }, P.BOOKINGS)).toBe(false);
  });

  test('the catalog is public and lists exactly the six permissions with suggested ACL bundles', async () => {
    const res = await request(app).get('/api/permissions/catalog');
    expect(res.status).toBe(200);
    expect(res.body.permissions.map((p) => p.name)).toEqual(Object.values(P));
    expect(res.body.permissions.every((p) => p.title && p.grants)).toBe(true);
    expect(Object.keys(res.body.suggested_bundles).sort()).toEqual(['ADMIN', 'FACULTY', 'STUDENT_REP', 'VIEWER']);
  });
});

// User management: GET /api/auth/users (read-only admin list) and DELETE /api/auth/users/:id
// (soft delete). Identity, roles and profile are owned by Google SSO + the ACL, so there is no
// create/edit/approve endpoint any more (see the removed-endpoint check in security.test.js).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, createRep, createViewer, createRoom, insertBooking, futureSlot, closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

const getUser = async (id) => (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];

let admin;
beforeAll(async () => { admin = await createAdmin(); });

// ─── GET /users ─────────────────────────────────────────────────────────────
describe('GET /api/auth/users', () => {
  test('admin gets paginated {data, meta} without password or reset-token fields', async () => {
    const { user } = await createViewer();
    const all = await request(app).get('/api/auth/users').set('Authorization', admin.auth);
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 20 });
    const { rows: [{ c }] } = await db.query('SELECT count(*)::int AS c FROM users WHERE is_active');
    expect(all.body.meta.total).toBe(c);
    const res = await request(app).get(`/api/auth/users?search=${encodeURIComponent(user.email)}`).set('Authorization', admin.auth);
    expect(res.body.meta.totalPages).toBe(Math.ceil(res.body.meta.total / 20));
    expect(res.body.data.length).toBeLessThanOrEqual(20);
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

  test('search and role filters narrow the list; deactivated users are excluded', async () => {
    const tag = `flt${process.pid}${Date.now().toString(36)}`;
    const { user: rep } = await createRep({ name: `Filter ${tag} rep` });
    const { user: viewer } = await createViewer({ name: `Filter ${tag} viewer` });
    const { user: gone } = await createViewer({ name: `Filter ${tag} gone` });
    expect((await request(app).delete(`/api/auth/users/${gone.id}`).set('Authorization', admin.auth)).status).toBe(200);
    const all = await request(app).get(`/api/auth/users?search=${tag}`).set('Authorization', admin.auth);
    expect(all.body.data.map((u) => u.id).sort()).toEqual([rep.id, viewer.id].sort());
    expect(all.body.meta.total).toBe(2);
    const reps = await request(app).get(`/api/auth/users?search=${tag}&role=STUDENT_REP`).set('Authorization', admin.auth);
    expect(reps.body.data.map((u) => u.id)).toEqual([rep.id]);
    expect(reps.body.meta.total).toBe(1);
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

// ─── DELETE /users/:id ──────────────────────────────────────────────────────
describe('DELETE /api/auth/users/:id', () => {
  test('admin deletes a user → 200; row soft-deleted (is_active=false, deactivated_at), hidden from the list; second delete 404', async () => {
    const { user } = await createViewer();
    const res = await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'User deactivated' });
    const row = await getUser(user.id);
    expect(row).toMatchObject({ id: user.id, email: user.email, is_active: false });
    expect(row.deactivated_at).not.toBeNull();
    expect(row.session_version).toBe((user.session_version || 0) + 1);
    const list = await request(app).get(`/api/auth/users?search=${encodeURIComponent(user.email)}`).set('Authorization', admin.auth);
    expect(list.body.data.map((u) => u.id)).not.toContain(user.id);
    expect(list.body.meta.total).toBe(0);
    const again = await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: 'User not found' });
  });

  // Re-sign-in of a deactivated account (dev-login / Google) is covered in sso.test.js.
  test('a soft-deleted user\'s token → 401', async () => {
    const { user, auth } = await createViewer();
    expect((await request(app).get('/api/auth/faculties').set('Authorization', auth)).status).toBe(200); // token works before
    expect((await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(200);
    const res = await request(app).get('/api/auth/faculties').set('Authorization', auth);
    expect(res.status).toBe(401);
  });

  test('deleting a user cancels their upcoming ACTIVE/PENDING bookings (rows kept); past bookings untouched', async () => {
    const { user } = await createRep();
    const room = await createRoom();
    const s1 = futureSlot({ hour: 10 });
    const s2 = futureSlot({ hour: 11 });
    const active = await insertBooking({ room_id: room.id, created_by: user.id, start_time: s1.start });
    const pending = await insertBooking({ room_id: room.id, created_by: user.id, start_time: s2.start, status: 'PENDING' });
    const past = await insertBooking({ room_id: room.id, created_by: user.id, start_time: new Date(Date.now() - 48 * 3600_000).toISOString() });
    expect((await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(200);
    const st = async (id) => (await db.query('SELECT status, cancelled_at, created_by FROM bookings WHERE id = $1', [id])).rows[0];
    for (const b of [active, pending]) {
      expect(await st(b.id)).toMatchObject({ status: 'CANCELLED', created_by: user.id });
      expect((await st(b.id)).cancelled_at).not.toBeNull();
    }
    expect(await st(past.id)).toMatchObject({ status: 'ACTIVE', created_by: user.id });
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
    expect((await getUser(other.id)).is_active).toBe(true);
    expect((await getUser(user.id)).is_active).toBe(true);
  });

  test('deleting a user keeps the row and its department reference', async () => {
    const { rows: [dept] } = await db.query('SELECT id FROM departments WHERE is_active ORDER BY id LIMIT 1');
    const { user } = await createViewer({ department_id: dept.id });
    expect((await request(app).delete(`/api/auth/users/${user.id}`).set('Authorization', admin.auth)).status).toBe(200);
    expect((await getUser(user.id)).department_id).toBe(dept.id);
  });
});

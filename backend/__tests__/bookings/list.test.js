import request from 'supertest';
import app from '../../src/server.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { ist } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const get = (auth, path = '/api/bookings', query = {}) => {
  const r = request(app).get(path).query(query);
  if (auth) r.set('Authorization', auth);
  return r;
};

let owner; let fac; let roomA; let roomB; let slots; let bookings; let viewer;

beforeAll(async () => {
  owner = await createRep({ branch: 'IT', section: 2, semester: 5 });
  fac = await createFaculty();
  viewer = await createViewer();
  roomA = await createRoom();
  roomB = await createRoom();
  slots = [futureSlot({ hour: 9 }), futureSlot({ hour: 10 }), futureSlot({ hour: 11, skip: 1 })];
  bookings = [
    await insertBooking({ room_id: roomA.id, created_by: owner.user.id, start_time: slots[0].start, purpose: 'b0' }),
    await insertBooking({ room_id: roomB.id, created_by: owner.user.id, start_time: slots[1].start, purpose: 'b1', status: 'PENDING', faculty_id: fac.faculty.id }),
    await insertBooking({ room_id: roomA.id, created_by: owner.user.id, start_time: slots[2].start, purpose: 'b2', status: 'CANCELLED' }),
  ];
});

describe('GET /api/bookings', () => {
  test('no token → 401', async () => {
    expect((await get(null)).status).toBe(401);
  });

  test('user_id filter returns that user\'s bookings (all statuses), newest first, with joined fields', async () => {
    const res = await get(owner.auth, '/api/bookings', { user_id: owner.user.id });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 3, page: 1, limit: 20, totalPages: 1 });
    expect(res.body.data.map((b) => b.id)).toEqual([bookings[2].id, bookings[1].id, bookings[0].id]);
    const pending = res.body.data.find((b) => b.id === bookings[1].id);
    expect(pending).toMatchObject({
      room_name: roomB.name, user_name: owner.user.name, user_role: 'STUDENT_REP', faculty_name: fac.faculty.name,
      status: 'PENDING', class_name: 'IT-2 3rd Year',
    });
    expect(res.body.data.every((b) => b.created_by === owner.user.id)).toBe(true);
  });

  test('room_id filter', async () => {
    const res = await get(owner.auth, '/api/bookings', { room_id: roomA.id });
    expect(res.status).toBe(200);
    expect(res.body.data.map((b) => b.id).sort()).toEqual([bookings[0].id, bookings[2].id].sort());
    expect(res.body.meta.total).toBe(2);
  });

  test('date range filter (start_date <= start_time, end_time <= end_date)', async () => {
    const res = await get(owner.auth, '/api/bookings', {
      user_id: owner.user.id, start_date: slots[0].start, end_date: slots[0].end,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.map((b) => b.id)).toEqual([bookings[0].id]);
    expect(res.body.meta.total).toBe(1);
  });

  test('pagination: limit/page and meta', async () => {
    const p1 = await get(owner.auth, '/api/bookings', { user_id: owner.user.id, limit: 2, page: 1 });
    const p2 = await get(owner.auth, '/api/bookings', { user_id: owner.user.id, limit: 2, page: 2 });
    expect(p1.body.meta).toEqual({ total: 3, page: 1, limit: 2, totalPages: 2 });
    expect(p1.body.data).toHaveLength(2);
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.data[0].id).toBe(bookings[0].id);
  });

  test('non-numeric limit/page fall back to defaults', async () => {
    const res = await get(owner.auth, '/api/bookings', { user_id: owner.user.id, limit: 'abc', page: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
  });

  // SEC-10 (fixed): other people's bookings are free/busy plus who holds them — never the purpose.
  test('[SEC-10] a VIEWER sees others\' bookings with booker name/branch/year/section but no purpose or faculty', async () => {
    const res = await get(viewer.auth, '/api/bookings', { user_id: owner.user.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    for (const b of res.body.data) {
      expect(b.visibility).toBe('limited');
      expect(b.user_name).toBe(owner.user.name);
      expect(b).toHaveProperty('branch');
      expect(b).toHaveProperty('year');
      expect(b).toHaveProperty('section');
      expect(b).toHaveProperty('class_name');
      for (const hidden of ['purpose', 'faculty_id', 'faculty_name', 'department_name', 'user_email', 'is_semester_booking']) {
        expect(b).not.toHaveProperty(hidden);
      }
      expect(typeof b.can_request_transfer).toBe('boolean');
    }
    // A VIEWER can't request transfers at all.
    expect(res.body.data.every((b) => b.can_request_transfer === false)).toBe(true);
  });

  test('[SEC-10] the booker sees their own bookings in full', async () => {
    const res = await get(owner.auth, '/api/bookings', { user_id: owner.user.id });
    expect(res.body.data.every((b) => b.visibility === 'full' && 'purpose' in b)).toBe(true);
  });

  test('[SEC-10] admins see everything in full (list and admin/all)', async () => {
    const admin = await createAdmin();
    for (const path of ['/api/bookings', '/api/bookings/admin/all']) {
      const res = await get(admin.auth, path, { user_id: owner.user.id });
      expect(res.body.data.every((b) => b.visibility === 'full' && 'purpose' in b)).toBe(true);
    }
  });

  test('[SEC-10] a rep may request transfers only of future ACTIVE bookings of others', async () => {
    const rep = await createRep();
    const res = await get(rep.auth, '/api/bookings', { user_id: owner.user.id });
    for (const b of res.body.data) {
      const expected = b.status === 'ACTIVE' && new Date(b.start_time) > new Date();
      expect(b.can_request_transfer).toBe(expected);
    }
  });

  test('[SEC-10] limit is capped server-side at 1000', async () => {
    const res = await get(viewer.auth, '/api/bookings', { limit: 100000 });
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(1000);
  });

  test('[NEW-bookings-3] negative limit / page are clamped, not a 500', async () => {
    const a = await get(viewer.auth, '/api/bookings', { limit: -5 });
    const b = await get(viewer.auth, '/api/bookings', { page: -1 });
    expect(a.status).toBe(200);
    expect(a.body.meta.limit).toBe(1);
    expect(b.status).toBe(200);
    expect(b.body.meta.page).toBe(1);
  });

  test.failing('[BKG-13] slot filter matches the IST hour (slot=10 finds a 10:00 IST booking)', async () => {
    const res = await get(owner.auth, '/api/bookings', { user_id: owner.user.id, slot: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.map((b) => b.id)).toEqual([bookings[1].id]);
  });

  test('slot filter currently matches the UTC hour (10:00 IST = 04 UTC) — documents BKG-13', async () => {
    const { dateKey } = slots[1];
    expect(slots[1].start).toBe(ist(dateKey, 10));
    const res = await get(owner.auth, '/api/bookings', { user_id: owner.user.id, slot: 4 });
    expect(res.status).toBe(200);
    // 09:00 IST = 03:30 UTC (hour 3), 10:00 IST = 04:30 UTC (hour 4), 11:00 IST = 05:30 UTC (hour 5)
    expect(res.body.data.map((b) => b.id)).toEqual([bookings[1].id]);
  });
});

describe('GET /api/bookings/admin/all', () => {
  test('ADMIN gets all bookings including CANCELLED', async () => {
    const admin = await createAdmin();
    const res = await get(admin.auth, '/api/bookings/admin/all', { user_id: owner.user.id });
    expect(res.status).toBe(200);
    expect(res.body.data.map((b) => b.status).sort()).toEqual(['ACTIVE', 'CANCELLED', 'PENDING']);
  });

  test('FACULTY / STUDENT_REP / VIEWER → 403; no token → 401', async () => {
    for (const who of [fac, owner, viewer]) {
      const res = await get(who.auth, '/api/bookings/admin/all');
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Forbidden' });
    }
    expect((await get(null, '/api/bookings/admin/all')).status).toBe(401);
  });
});

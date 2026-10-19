import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { uniq, ist, getBooking, auditRows } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const quick = (auth, body) => {
  const r = request(app).post('/api/bookings/admin/quick');
  if (auth) r.set('Authorization', auth);
  return r.send(body);
};

const iso = (d) => new Date(d).toISOString();

describe('POST /api/bookings/admin/quick', () => {
  let admin;
  beforeAll(async () => { admin = await createAdmin(); });

  test('admin quick-books an existing room for themselves: 201, 1h IST slot, default purpose', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 10 });
    const res = await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 10 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ room_id: room.id, created_by: admin.user.id, purpose: 'Admin Quick Booking', status: 'ACTIVE' });
    expect(iso(res.body.start_time)).toBe(ist(dateKey, 10));
    expect(iso(res.body.end_time)).toBe(ist(dateKey, 11));
    expect(await auditRows(res.body.id, 'CREATE_BOOKING')).toHaveLength(1);
  });

  test('room lookup is case-insensitive and custom purpose is kept', async () => {
    const room = await createRoom({ name: uniq('qb-').slice(0, 30) });
    const { dateKey } = futureSlot({ hour: 11 });
    const res = await quick(admin.auth, { room_name: room.name.toUpperCase(), date: dateKey, slot: 11, purpose: 'Exam' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ room_id: room.id, purpose: 'Exam' });
  });

  test('target_user_id books on behalf of another user', async () => {
    const room = await createRoom();
    const rep = await createRep();
    const { dateKey } = futureSlot({ hour: 12 });
    const res = await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 12, target_user_id: rep.user.id });
    expect(res.status).toBe(201);
    expect(res.body.created_by).toBe(rep.user.id);
    expect((await getBooking(res.body.id)).created_by).toBe(rep.user.id);
  });

  test('admin may quick-book weekends and beyond 7 days', async () => {
    const room = await createRoom();
    const sat = futureSlot({ hour: 10, weekend: true });
    expect((await quick(admin.auth, { room_name: room.name, date: sat.dateKey, slot: 10 })).status).toBe(201);
  });

  test('room conflict → 409', async () => {
    const room = await createRoom();
    const slot = futureSlot({ hour: 13 });
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start });
    const res = await quick(admin.auth, { room_name: room.name, date: slot.dateKey, slot: 13 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Room is already booked for this time period (or pending approval)');
  });

  test('target user already busy → 409', async () => {
    const rep = await createRep();
    const slot = futureSlot({ hour: 14 });
    const roomX = await createRoom();
    await insertBooking({ room_id: roomX.id, created_by: rep.user.id, start_time: slot.start });
    const res = await quick(admin.auth, { room_name: (await createRoom()).name, date: slot.dateKey, slot: 14, target_user_id: rep.user.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(`You already have another booking during this time in Room ${roomX.name}`);
  });

  test.each([
    ['missing room_name', { date: '2026-01-05', slot: 10 }, 'Room name required'],
    ['bad date', { room_name: 'X', date: 'tomorrow', slot: 10 }, 'Valid date required'],
    ['slot 24', { room_name: 'X', date: '2026-01-05', slot: 24 }, 'Slot must be between 0 and 23'],
    ['slot -1', { room_name: 'X', date: '2026-01-05', slot: -1 }, 'Slot must be between 0 and 23'],
    ['missing slot', { room_name: 'X', date: '2026-01-05' }, 'Slot must be between 0 and 23'],
  ])('validation: %s → 400', async (_n, body, msg) => {
    const res = await quick(admin.auth, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
  });

  test('FACULTY / STUDENT_REP → 403; no token → 401', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 15 });
    for (const who of [await createFaculty(), await createRep()]) {
      const res = await quick(who.auth, { room_name: room.name, date: dateKey, slot: 15 });
      expect(res.status).toBe(403);
    }
    expect((await quick(null, { room_name: room.name, date: dateKey, slot: 15 })).status).toBe(401);
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('unknown room name currently auto-creates a room (documents BKG-18)', async () => {
    const name = `9${uniq('').slice(-8)}`;
    const { dateKey } = futureSlot({ hour: 16 });
    const res = await quick(admin.auth, { room_name: name, date: dateKey, slot: 16 });
    expect(res.status).toBe(201);
    const { rows: [room] } = await db.query('SELECT * FROM rooms WHERE name = $1', [name]);
    expect(room).toMatchObject({ building: '9th Block', capacity: 40 });
  });

  test.failing('[BKG-18] unknown / typo room name → 404 and no room is created', async () => {
    const name = uniq('typo').slice(0, 30);
    const { dateKey } = futureSlot({ hour: 9 });
    const res = await quick(admin.auth, { room_name: name, date: dateKey, slot: 9 });
    expect(res.status).toBe(404);
    expect((await db.query('SELECT 1 FROM rooms WHERE name = $1', [name])).rows).toHaveLength(0);
  });

  test.failing('[BKG-18] full ISO datetime in `date` (passes validator) → 400, not 500', async () => {
    const room = await createRoom();
    const res = await quick(admin.auth, { room_name: room.name, date: '2030-01-07T10:00:00Z', slot: 10 });
    expect(res.status).toBe(400);
  });

  test('[NEW-bookings-4] non-existent target_user_id → 400/404, not 500', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 17 });
    const res = await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 17, target_user_id: 2147483000 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { uniq, ist, getBooking, auditRows, insertTimetableSlot } from '../../test/helpers/bookings.js';

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

  test('hours books a multi-hour block (Room Grid drawer); invalid hours → 400', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 13 });
    const res = await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 13, hours: 2 });
    expect(res.status).toBe(201);
    expect(iso(res.body.start_time)).toBe(ist(dateKey, 13));
    expect(iso(res.body.end_time)).toBe(ist(dateKey, 15));
    for (const hours of [0, -1, 1.5, 'two']) {
      expect((await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 16, hours })).status).toBe(400);
    }
    // Longer than the 4-hour rule → 400 from the shared rules.
    expect((await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 8, hours: 5 })).status).toBe(400);
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
    // Admin quick-book: ACTIVE for the target student straight away, no faculty needed.
    expect(res.body).toMatchObject({ created_by: rep.user.id, status: 'ACTIVE', faculty_id: null });
    expect((await getBooking(res.body.id)).created_by).toBe(rep.user.id);
    const [audit] = await auditRows(res.body.id, 'CREATE_BOOKING');
    expect(audit.user_id).toBe(admin.user.id);
    expect(audit.details.on_behalf_of).toBe(rep.user.id);
  });

  test("the target student's section timetable still applies → 409", async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 3, section: 1, day_of_week: 'Tue', slot_time: '10:00-11:00', subject_name: 'Lecture' });
    const rep = await createRep({ branch: dept, semester: 3, section: 1 });
    const slot = futureSlot({ hour: 10, day: 'Tue', minLeadHours: 0 });
    const res = await quick(admin.auth, { room_name: (await createRoom()).name, date: slot.dateKey, slot: 10, target_user_id: rep.user.id });
    expect(res.status).toBe(409);
    expect(res.body.conflict).toMatchObject({ type: 'timetable', label: 'your section timetable' });
  });

  test("a quick book over the room's class cancels the class for that date (decision 2026-10-22)", async () => {
    const room = await createRoom();
    await insertTimetableSlot({ department: uniq('D '), semester: 1, section: 1, day_of_week: 'Wed', slot_time: '12:00-01:00', room_name: room.name, subject_name: 'Noon' });
    const slot = futureSlot({ hour: 12, day: 'Wed', minLeadHours: 0 });
    const res = await quick(admin.auth, { room_name: room.name, date: slot.dateKey, slot: 12 });
    expect(res.status).toBe(201);
    const { rows } = await db.query(
      "SELECT start_hour FROM room_slot_releases WHERE source_type = 'admin_booking' AND room_id = $1 AND release_date = $2 AND is_active", [room.id, slot.dateKey]);
    expect(rows).toEqual([{ start_hour: 12 }]);
  });

  test('time rules still apply: slot 7 (before opening) and a past date → 400', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 10 });
    const early = await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 7 });
    expect(early.status).toBe(400);
    expect(early.body).toEqual({ error: 'Rooms can be booked between 08:00 and 20:00' });
    const past = await quick(admin.auth, { room_name: room.name, date: '2024-01-08', slot: 10 });
    expect(past.status).toBe(400);
    expect(past.body).toEqual({ error: 'Cannot book in the past' });
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
    expect(res.body).toEqual({ error: 'Room is already booked for this time period', conflict: { type: 'room_booked' } });
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

  test.each([
    ['unknown', () => uniq('typo').slice(0, 30)],
    ['typo of a real "9"-block name (used to auto-create a 9th Block room)', () => `9${uniq('').slice(-8)}`],
  ])('[BKG-18] %s room name → 404 and no room is created', async (_n, makeName) => {
    const name = makeName();
    const { dateKey } = futureSlot({ hour: 9 });
    const res = await quick(admin.auth, { room_name: name, date: dateKey, slot: 9 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: `Room ${name} not found` });
    expect((await db.query('SELECT 1 FROM rooms WHERE name = $1', [name])).rows).toHaveLength(0);
  });

  test('[BKG-18] full ISO datetime in `date` (passes validator) → 400, not 500', async () => {
    const room = await createRoom();
    const res = await quick(admin.auth, { room_name: room.name, date: '2030-01-07T10:00:00Z', slot: 10 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'date must be YYYY-MM-DD' });
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('[NEW-P4-6] an impossible calendar date (Feb 30) → 400, not a booking on another day', async () => {
    // isISO8601() (non-strict) and the YYYY-MM-DD regex both accept "YYYY-02-30"; istDateTimeToUtc then
    // rolls it over to 2 March and an admin (no 7-day window) gets a 201 booking on a date nobody asked for.
    const room = await createRoom();
    const year = new Date().getUTCFullYear() + 1;
    const res = await quick(admin.auth, { room_name: room.name, date: `${year}-02-30`, slot: 10 });
    expect(res.status).toBe(400);
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('[NEW-bookings-4] non-existent or deactivated target_user_id → 400, nothing inserted', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 17 });
    const gone = await createRep();
    await db.query('UPDATE users SET is_active = FALSE WHERE id = $1', [gone.user.id]);
    for (const target_user_id of [2147483000, gone.user.id]) {
      const res = await quick(admin.auth, { room_name: room.name, date: dateKey, slot: 17, target_user_id });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Target user not found' });
    }
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });
});

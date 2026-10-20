// Rooms, availability, admin room status, week schedule and conflict check.
// Replaces the legacy __tests__/rooms.test.js (all of its cases are covered here).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, approverId,
  futureSlot, closeDb,
} from '../../test/helpers/factories.js';

import { historyRows, insertTimetableSlot, insertFacultySlot, insertRelease } from '../../test/helpers/bookings.js';

afterAll(closeDb);

let n = 0;
const tag = () => `${process.pid.toString(36)}${Date.now().toString(36)}${(n++).toString(36)}`.slice(-10);

/** Monday (YYYY-MM-DD) of the IST week containing dateKey. */
function mondayOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 = Sun
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
const addDays = (dateKey, days) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

let admin, rep, faculty, viewer;
beforeAll(async () => {
  [admin, rep, faculty, viewer] = await Promise.all([createAdmin(), createRep(), createFaculty(), createViewer()]);
});

// ─── GET /api/rooms ───────────────────────────────────────────────────────────
describe('GET /api/rooms', () => {
  let building, lab, big, committee, auditorium, ground;
  beforeAll(async () => {
    building = `RTT-B-${tag()}`;
    lab = await createRoom({ building, floor: 1, capacity: 60, has_ac: true, has_projector: true, type: 'Lab' });
    big = await createRoom({ building, floor: 2, capacity: 120, has_ac: false, has_projector: true });
    committee = await createRoom({ building, floor: 1, capacity: 15, type: 'Committee Room' });
    auditorium = await createRoom({ building, floor: 1, capacity: 300, type: 'Auditorium', has_ac: true });
    ground = await createRoom({ building, floor: 0, capacity: 30 });
  });

  const ids = (rows) => rows.map((r) => r.id).sort((a, b) => a - b);
  const get = (auth, query) => request(app).get('/api/rooms').set('Authorization', auth).query(query);

  test('401 without a token / with a bad token', async () => {
    expect((await request(app).get('/api/rooms')).status).toBe(401);
    const bad = await request(app).get('/api/rooms').set('Authorization', 'Bearer not.a.jwt');
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('Invalid token');
  });

  test('legacy: lists rooms matching capacity + ac + projector', async () => {
    const res = await get(rep.auth, { capacity: 50, ac: 'true', projector: 'true', building });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([lab.id]);
    const r = res.body[0];
    expect(r).toMatchObject({ name: lab.name, capacity: 60, has_ac: true, has_projector: true, type: 'Lab', student_access: true });
    expect(r).toHaveProperty('description');
  });

  test('admin sees every room in the building, incl. committee rooms and auditoriums', async () => {
    const res = await get(admin.auth, { building });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(ids([lab, big, committee, auditorium, ground]));
  });

  test('faculty also sees committee rooms and auditoriums', async () => {
    const res = await get(faculty.auth, { building });
    expect(ids(res.body)).toEqual(ids([lab, big, committee, auditorium, ground]));
  });

  test.each([['VIEWER'], ['STUDENT_REP']])('%s does not see committee rooms / auditoriums', async (role) => {
    const who = role === 'VIEWER' ? viewer : rep;
    const res = await get(who.auth, { building });
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(ids([lab, big, ground]));
  });

  test('capacity is a minimum', async () => {
    const res = await get(admin.auth, { building, capacity: 100 });
    expect(ids(res.body)).toEqual(ids([big, auditorium]));
  });

  test('floor filter: number and "G" for ground; "all" disables it', async () => {
    expect(ids((await get(admin.auth, { building, floor: 2 })).body)).toEqual([big.id]);
    expect(ids((await get(admin.auth, { building, floor: 'G' })).body)).toEqual([ground.id]);
    expect((await get(admin.auth, { building, floor: 'all' })).body).toHaveLength(5);
    // non-numeric floor is ignored rather than erroring
    expect((await get(admin.auth, { building, floor: 'x' })).body).toHaveLength(5);
  });

  test('type filter; "all" disables it', async () => {
    expect(ids((await get(admin.auth, { building, type: 'Lab' })).body)).toEqual([lab.id]);
    expect((await get(admin.auth, { building, type: 'all' })).body).toHaveLength(5);
  });

  test('building filter accepts a comma list and repeated params', async () => {
    const other = `RTT-B-${tag()}`;
    const o = await createRoom({ building: other });
    const comma = await get(admin.auth, { building: `${building},${other}` });
    expect(comma.body).toHaveLength(6);
    expect(ids(comma.body)).toContain(o.id);
    const rep2 = await request(app).get(`/api/rooms?building=${encodeURIComponent(building)}&building=${encodeURIComponent(other)}`)
      .set('Authorization', admin.auth);
    expect(rep2.body).toHaveLength(6);
  });

  test('pagination returns { data, meta } ordered by name', async () => {
    const res = await get(admin.auth, { building, page: 1, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 5, page: 1, limit: 2, totalPages: 3 });
    expect(res.body.data).toHaveLength(2);
    const names = [lab, big, committee, auditorium, ground].map((r) => r.name).sort();
    expect(res.body.data.map((r) => r.name)).toEqual(names.slice(0, 2));
    const p3 = await get(admin.auth, { building, page: 3, limit: 2 });
    expect(p3.body.data.map((r) => r.name)).toEqual(names.slice(4));
  });

  test('[NEW-RTT-1] paginated meta.total for students counts only rooms they can see', async () => {
    const res = await get(rep.auth, { building, page: 1, limit: 10 });
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta.total).toBe(3); // currently 5: hidden committee/auditorium rooms are counted
  });
});

// ─── POST/PATCH/DELETE /api/rooms ─────────────────────────────────────────────
describe('Room CRUD (admin)', () => {
  const full = (name) => ({
    name, building: 'Block IV', floor: 2, capacity: 45, type: 'Lab',
    has_ac: true, has_projector: false, description: 'A mock classroom description', student_access: false,
  });

  test('legacy: admin creates a room with every field (201) and it is persisted', async () => {
    const name = `CR-${tag()}`;
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send(full(name));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...full(name), id: expect.any(Number) });
    const { rows } = await db.query('SELECT * FROM rooms WHERE id = $1', [res.body.id]);
    expect(rows[0]).toMatchObject({ name, capacity: 45, type: 'Lab', student_access: false, description: 'A mock classroom description' });
  });

  test('create applies defaults (type Lecture Room, student_access true, no ac/projector)', async () => {
    const name = `CR-${tag()}`;
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name, capacity: '40' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name, capacity: 40, type: 'Lecture Room', student_access: true, has_ac: false, has_projector: false, floor: null, description: null });
  });

  test.each([
    [{ capacity: 10 }],
    [{ name: 'X' }],
    [{}],
  ])('create 400 when name or capacity is missing: %j', async (body) => {
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing name or capacity');
  });

  test('create: 401 without token; 403 for VIEWER, STUDENT_REP (legacy) and FACULTY', async () => {
    const body = { name: `CR-${tag()}`, capacity: 45 };
    expect((await request(app).post('/api/rooms').send(body)).status).toBe(401);
    for (const u of [viewer, rep, faculty]) {
      const res = await request(app).post('/api/rooms').set('Authorization', u.auth).send(body);
      expect(res.status).toBe(403);
    }
    const { rowCount } = await db.query('SELECT 1 FROM rooms WHERE name = $1', [body.name]);
    expect(rowCount).toBe(0);
  });

  test('[NEW-RTT-2] creating a room with a duplicate name returns 409 (not 500)', async () => {
    const existing = await createRoom();
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: existing.name, capacity: 10 });
    expect(res.status).toBe(409);
  });

  test('[NEW-RTT-2] renaming a room onto an existing name returns 409 (not 500)', async () => {
    const a = await createRoom();
    const b = await createRoom();
    const res = await request(app).patch(`/api/rooms/${b.id}`).set('Authorization', admin.auth).send({ ...full(a.name) });
    expect(res.status).toBe(409);
  });

  test('[NEW-RTT-3] create rejects non-numeric capacity with 400 (not 500)', async () => {
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: `CR-${tag()}`, capacity: 'lots' });
    expect(res.status).toBe(400);
  });

  test('[NEW-RTT-3] create rejects negative / zero capacity with 400', async () => {
    const name = `CR-${tag()}`;
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name, capacity: -5 });
    expect(res.status).toBe(400);
  });

  test('[NEW-RTT-3] create rejects a name longer than the 32-char column with 400 (not 500)', async () => {
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: 'N'.repeat(40), capacity: 10 });
    expect(res.status).toBe(400);
  });

  test('legacy: admin updates a room (all fields)', async () => {
    const room = await createRoom({ type: 'Lab', student_access: false });
    const name = `CU-${tag()}`;
    const res = await request(app).patch(`/api/rooms/${room.id}`).set('Authorization', admin.auth).send({
      name, building: 'Block IV', floor: 2, capacity: 50, type: 'Lecture Room',
      has_ac: true, has_projector: true, description: 'Updated mock classroom description', student_access: true,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: room.id, name, capacity: 50, description: 'Updated mock classroom description', student_access: true, has_projector: true });
    const { rows } = await db.query('SELECT name, capacity FROM rooms WHERE id = $1', [room.id]);
    expect(rows[0]).toEqual({ name, capacity: 50 });
  });

  test('update: 404 for an unknown room', async () => {
    const res = await request(app).patch('/api/rooms/987654321').set('Authorization', admin.auth).send(full(`CU-${tag()}`));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Room not found');
  });

  test('update: 401 without token; 403 for VIEWER, STUDENT_REP (legacy), FACULTY', async () => {
    const room = await createRoom({ capacity: 60 });
    expect((await request(app).patch(`/api/rooms/${room.id}`).send({ capacity: 1 })).status).toBe(401);
    for (const u of [viewer, rep, faculty]) {
      expect((await request(app).patch(`/api/rooms/${room.id}`).set('Authorization', u.auth).send({ capacity: 1 })).status).toBe(403);
    }
    const { rows } = await db.query('SELECT capacity FROM rooms WHERE id = $1', [room.id]);
    expect(rows[0].capacity).toBe(60);
  });

  test('[NEW-RTT-4] PATCH with only { capacity } updates capacity and keeps the other fields (currently 500)', async () => {
    const room = await createRoom({ capacity: 60, building: 'Keep', type: 'Lab', has_ac: true });
    const res = await request(app).patch(`/api/rooms/${room.id}`).set('Authorization', admin.auth).send({ capacity: 70 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: room.name, capacity: 70, building: 'Keep', type: 'Lab', has_ac: true });
  });

  test('[NEW-RTT-4] PATCH with { name, capacity } does not wipe building/floor/type/ac/projector/student_access', async () => {
    const room = await createRoom({ building: 'Keep', floor: 3, type: 'Lab', has_ac: true, has_projector: true, student_access: false });
    const res = await request(app).patch(`/api/rooms/${room.id}`).set('Authorization', admin.auth).send({ name: room.name, capacity: 61 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ building: 'Keep', floor: 3, type: 'Lab', has_ac: true, has_projector: true, student_access: false });
  });

  test('admin deletes a room: 200, row soft-deleted (is_active=false, deactivated_at), availability rows kept; second delete is 404', async () => {
    const room = await createRoom();
    await db.query("INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Mon', 9, false)", [room.id]);
    const res = await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'Success', message: `Room ${room.name} deleted successfully` });
    const { rows: [row] } = await db.query('SELECT * FROM rooms WHERE id = $1', [room.id]);
    expect(row).toMatchObject({ id: room.id, name: room.name, is_active: false });
    expect(row.deactivated_at).not.toBeNull();
    expect((await db.query('SELECT 1 FROM room_availability WHERE room_id = $1', [room.id])).rowCount).toBe(1);
    const again = await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: 'Room not found' });
  });

  test('a soft-deleted room is hidden from GET /api/rooms (plain and paginated) and cannot be updated', async () => {
    const building = `SD-${tag()}`;
    const keep = await createRoom({ building });
    const gone = await createRoom({ building });
    await request(app).delete(`/api/rooms/${gone.id}`).set('Authorization', admin.auth).expect(200);
    for (const u of [admin, rep]) {
      const res = await request(app).get('/api/rooms').set('Authorization', u.auth).query({ building });
      expect(res.status).toBe(200);
      expect(res.body.map((r) => r.id)).toEqual([keep.id]);
    }
    const paged = await request(app).get('/api/rooms').set('Authorization', admin.auth).query({ building, page: 1, limit: 10 });
    expect(paged.body.data.map((r) => r.id)).toEqual([keep.id]);
    expect(paged.body.meta.total).toBe(1);
    const patch = await request(app).patch(`/api/rooms/${gone.id}`).set('Authorization', admin.auth).send({ name: gone.name, capacity: 5 });
    expect(patch.status).toBe(404);
    expect((await db.query('SELECT capacity FROM rooms WHERE id = $1', [gone.id])).rows[0].capacity).toBe(gone.capacity);
  });

  test('a soft-deleted room\'s name can be reused by a new room (names are unique among active rooms)', async () => {
    const room = await createRoom();
    await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth).expect(200);
    const res = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: room.name, capacity: 10 });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(room.id);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM rooms WHERE name = $1', [room.name])).rows[0].n).toBe(2);
  });

  test('delete keeps faculty timetable slots pointing at the room (room_id is not nulled)', async () => {
    const room = await createRoom();
    const slot = await insertFacultySlot({ faculty_name: 'RTT Prof', room_id: room.id });
    expect((await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth)).status).toBe(200);
    const { rows } = await db.query('SELECT room_id, is_active FROM faculty_timetable_slots WHERE id = $1', [slot.id]);
    expect(rows[0]).toEqual({ room_id: room.id, is_active: true });
  });

  test('delete: 401 without token; 403 for VIEWER, STUDENT_REP (legacy), FACULTY', async () => {
    const room = await createRoom();
    expect((await request(app).delete(`/api/rooms/${room.id}`)).status).toBe(401);
    for (const u of [viewer, rep, faculty]) {
      expect((await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', u.auth)).status).toBe(403);
    }
    expect((await db.query('SELECT 1 FROM rooms WHERE id = $1', [room.id])).rowCount).toBe(1);
  });

  // BKG-14 (fixed by soft delete): room delete used to fail on FKs or silently cascade future bookings away.
  // Now the room is deactivated and its upcoming ACTIVE/PENDING bookings are CANCELLED (rows kept).
  test('[BKG-14] deleting a room cancels its upcoming ACTIVE/PENDING bookings (rows kept); past and other rooms untouched', async () => {
    const room = await createRoom();
    const other = await createRoom();
    const owner = await createRep();
    const s1 = futureSlot({ hour: 11 });
    const s2 = futureSlot({ hour: 12 });
    const active = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: s1.start, end_time: s1.end });
    const pending = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: s2.start, end_time: s2.end, status: 'PENDING' });
    const pastStart = new Date(Date.now() - 48 * 3600_000).toISOString();
    const past = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: pastStart, status: 'ACTIVE' });
    const otherOwner = await createRep();
    const elsewhere = await insertBooking({ room_id: other.id, created_by: otherOwner.user.id, start_time: s1.start, end_time: s1.end });

    const res = await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    const st = async (id) => (await db.query('SELECT status, cancelled_at FROM bookings WHERE id = $1', [id])).rows[0];
    for (const b of [active, pending]) {
      const row = await st(b.id);
      expect(row.status).toBe('CANCELLED');
      expect(row.cancelled_at).not.toBeNull();
    }
    expect((await st(past.id)).status).toBe('ACTIVE');
    expect((await st(elsewhere.id)).status).toBe('ACTIVE');
  });

  test('[BKG-14] deleting a room that appears in a booking\'s history (after a reschedule) does not 500', async () => {
    const oldRoom = await createRoom();
    const newRoom = await createRoom();
    const owner = await createRep();
    const slot = futureSlot({ hour: 12 });
    const b = await insertBooking({ room_id: oldRoom.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end });
    const moved = await request(app).patch(`/api/bookings/${b.id}`).set('Authorization', owner.auth).send({ room_id: newRoom.id });
    expect(moved.status).toBe(200);
    expect((await historyRows(b.id))[0].previous_room_id).toBe(oldRoom.id);

    const res = await request(app).delete(`/api/rooms/${oldRoom.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    // History and the moved booking are untouched.
    expect((await historyRows(b.id))[0].previous_room_id).toBe(oldRoom.id);
    expect((await db.query('SELECT room_id, status FROM bookings WHERE id = $1', [b.id])).rows[0]).toEqual({ room_id: newRoom.id, status: 'ACTIVE' });
  });
});

// ─── Student booking access (legacy) ─────────────────────────────────────────
describe('rooms.student_access (legacy)', () => {
  test('a student rep cannot book a room with student_access = false, but can when true', async () => {
    const room = await createRoom({ student_access: false });
    const booker = await createRep();
    const slot = futureSlot({ hour: 15 });
    // Students name the approving faculty member (mandatory); the request is then PENDING.
    const body = { room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Group Study Session', faculty_id: await approverId() };
    const denied = await request(app).post('/api/bookings').set('Authorization', booker.auth).send(body);
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('Students do not have permission to book this room');
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rowCount).toBe(0);

    await db.query('UPDATE rooms SET student_access = true WHERE id = $1', [room.id]);
    const ok = await request(app).post('/api/bookings').set('Authorization', booker.auth).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('PENDING');
  });
});

// ─── /api/availability ───────────────────────────────────────────────────────
describe('GET /api/availability and POST /api/availability/override', () => {
  const override = (auth, body) => request(app).post('/api/availability/override').set('Authorization', auth).send(body);
  const availRows = (rows, roomId) => rows.filter((r) => r.room_id === roomId);

  test('GET /api/availability: 401 without token; returns array of rows joined with room_name', async () => {
    expect((await request(app).get('/api/availability')).status).toBe(401);
    const room = await createRoom();
    await db.query("INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Tue', 10, false)", [room.id]);
    // bust cache through a real mutation path so the direct insert above is visible
    await override(admin.auth, { room_name: room.name, day: 'Tue', hour: 11, is_available: false });
    const res = await request(app).get('/api/availability').set('Authorization', viewer.auth);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const mine = availRows(res.body, room.id).sort((a, b) => a.hour - b.hour);
    expect(mine).toEqual([
      expect.objectContaining({ room_id: room.id, room_name: room.name, day: 'Tue', hour: 10, is_available: false }),
      expect.objectContaining({ room_id: room.id, room_name: room.name, day: 'Tue', hour: 11, is_available: false }),
    ]);
  });

  test('an ADMIN override returns Success, is stored with user_id and is visible immediately (no stale cache)', async () => {
    const room = await createRoom();
    const before = await request(app).get('/api/availability').set('Authorization', rep.auth);
    expect(availRows(before.body, room.id)).toEqual([]);

    const res = await override(admin.auth, { room_name: room.name, day: 'Mon', hour: 9, is_available: false });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'Success', message: `Room ${room.name} availability updated` });

    const { rows } = await db.query('SELECT day, hour, is_available, user_id FROM room_availability WHERE room_id = $1', [room.id]);
    expect(rows).toEqual([{ day: 'Mon', hour: 9, is_available: false, user_id: admin.user.id }]);

    const after = await request(app).get('/api/availability').set('Authorization', rep.auth);
    expect(availRows(after.body, room.id)).toEqual([expect.objectContaining({ day: 'Mon', hour: 9, is_available: false })]);
  });

  test('lifting a block (is_available=true) soft-deletes it; matches the room name case-insensitively; re-blocking revives it', async () => {
    const room = await createRoom();
    await override(admin.auth, { room_name: room.name, day: 'Wed', hour: 14, is_available: false });
    const res = await override(admin.auth, { room_name: room.name.toLowerCase(), day: 'Wed', hour: 14, is_available: true });
    expect(res.status).toBe(200);
    const rows = async () => (await db.query('SELECT is_available, is_active, deactivated_at IS NOT NULL AS lifted FROM room_availability WHERE room_id = $1', [room.id])).rows;
    expect(await rows()).toEqual([{ is_available: false, is_active: false, lifted: true }]);
    expect(availRows((await request(app).get('/api/availability').set('Authorization', rep.auth)).body, room.id)).toEqual([]);
    await override(admin.auth, { room_name: room.name, day: 'Wed', hour: 14, is_available: false });
    expect(await rows()).toEqual([{ is_available: false, is_active: true, lifted: false }]);
  });

  test('the database keeps room_availability to weekly blocks: no active "free" rows, no dated rows', async () => {
    const room = await createRoom();
    for (const [day, free] of [['Mon', true], ['2030-01-07', false]]) {
      await expect(db.query('INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, $2, 9, $3)', [room.id, day, free]))
        .rejects.toMatchObject({ constraint: 'room_availability_active_block' });
    }
  });

  test('classes block the calendar straight from the timetables, by room id (the rule the booking check uses)', async () => {
    const room = await createRoom();
    const dept = `CAL-${tag()}`;
    await insertTimetableSlot({ department: dept, day_of_week: 'Mon', slot_time: '09:00-11:00', room_name: room.name.toLowerCase(), subject_name: 'Two hours' });
    await insertTimetableSlot({ department: dept, day_of_week: 'Tue', slot_time: '10:30-11:30', room_id: room.id, subject_name: 'Half past' });
    await insertTimetableSlot({ department: dept, day_of_week: 'Wed', slot_time: '09:00-10:00', room_id: room.id, is_active: false, subject_name: 'Old' });
    await insertFacultySlot({ faculty_name: 'Cal Prof', day_of_week: 'Thu', slot_time: '02:00-03:00', room_id: room.id, is_occupied: true });
    await insertFacultySlot({ faculty_name: 'Cal Prof', day_of_week: 'Fri', slot_time: '02:00-03:00', room_id: room.id, is_occupied: false });
    await override(admin.auth, { room_name: room.name, day: 'Sat', hour: 9, is_available: false }); // busts the cache
    const res = await request(app).get('/api/availability').set('Authorization', viewer.auth);
    const mine = availRows(res.body, room.id).map(({ day: d, hour, is_available, source }) => [d, hour, is_available, source]);
    expect(mine).toEqual([
      ['Mon', 9, false, 'class'], ['Mon', 10, false, 'class'], ['Thu', 14, false, 'class'],
      ['Tue', 10, false, 'class'], ['Tue', 11, false, 'class'], ['Sat', 9, false, 'block'],
    ]);
  });

  test('[NEW-P5-4] active dated releases are reported per hour, after blocks; inactive and old ones are not', async () => {
    const room = await createRoom();
    const istToday = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const day = (n) => new Date(Date.parse(`${istToday}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const ins = (date, from, to, active = true) => db.query(
      `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type, is_active)
       VALUES ($1, $2, $3, $4, 'cancellation_request', $5)`, [room.id, date, from, to, active]);
    await ins(day(2), 10, 12);
    await ins(day(3), 9, 10, false); // withdrawn
    await ins(day(-30), 9, 10); // long past
    await override(admin.auth, { room_name: room.name, day: 'Fri', hour: 15, is_available: false }); // busts the cache
    const res = await request(app).get('/api/availability').set('Authorization', viewer.auth);
    const mine = availRows(res.body, room.id).map(({ day: d, hour, is_available, source }) => ({ d, hour, is_available, source }));
    expect(mine).toEqual([
      { d: 'Fri', hour: 15, is_available: false, source: 'block' },
      { d: day(2), hour: 10, is_available: true, source: 'release' },
      { d: day(2), hour: 11, is_available: true, source: 'release' },
    ]);
  });

  test.each([
    [{ day: 'Mon', hour: 9 }],
    [{ room_name: 'X', hour: 9 }],
    [{ room_name: 'X', day: 'Mon' }],
  ])('override 400 when a required field is missing: %j', async (body) => {
    const res = await override(admin.auth, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Missing required fields');
  });

  test('override: 401 without token, 403 for VIEWER', async () => {
    const room = await createRoom();
    expect((await request(app).post('/api/availability/override').send({ room_name: room.name, day: 'Mon', hour: 9 })).status).toBe(401);
    expect((await override(viewer.auth, { room_name: room.name, day: 'Mon', hour: 9, is_available: false })).status).toBe(403);
    expect((await db.query('SELECT 1 FROM room_availability WHERE room_id = $1', [room.id])).rowCount).toBe(0);
  });

  test('[SEC-05] a STUDENT_REP (or FACULTY) cannot flip the weekly availability of a room', async () => {
    const room = await createRoom();
    await db.query("INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Thu', 10, false)", [room.id]);
    const res = await override(rep.auth, { room_name: room.name, day: 'Thu', hour: 10, is_available: true });
    expect(res.status).toBe(403);
    expect((await override(faculty.auth, { room_name: room.name, day: 'Thu', hour: 10, is_available: true })).status).toBe(403);
    const { rows } = await db.query('SELECT is_available FROM room_availability WHERE room_id = $1', [room.id]);
    expect(rows[0].is_available).toBe(false);
  });

  test('[NEW-RTT-5] override for an unknown room returns 404', async () => {
    const res = await override(admin.auth, { room_name: `NOPE-${tag()}`, day: 'Mon', hour: 9, is_available: false });
    expect(res.status).toBe(404);
  });

  test('[NEW-RTT-5] override rejects an invalid day name with 400 (currently stored as-is)', async () => {
    const room = await createRoom();
    const res = await override(admin.auth, { room_name: room.name, day: 'Funday', hour: 9, is_available: false });
    expect(res.status).toBe(400);
    expect((await db.query('SELECT 1 FROM room_availability WHERE room_id = $1', [room.id])).rowCount).toBe(0);
  });

  test('[NEW-RTT-5] override rejects an out-of-range hour with 400 (currently stored as-is)', async () => {
    const room = await createRoom();
    const res = await override(admin.auth, { room_name: room.name, day: 'Mon', hour: 99, is_available: false });
    expect(res.status).toBe(400);
    expect((await db.query('SELECT 1 FROM room_availability WHERE room_id = $1', [room.id])).rowCount).toBe(0);
  });

  test('[NEW-RTT-5] override rejects a non-numeric hour with 400 (currently 500 with raw pg error)', async () => {
    const room = await createRoom();
    const res = await override(admin.auth, { room_name: room.name, day: 'Mon', hour: 'nine', is_available: false });
    expect(res.status).toBe(400);
  });

  test('[NEW-RTT-5] override requires is_available (omitting it currently stores NULL)', async () => {
    const room = await createRoom();
    const res = await override(admin.auth, { room_name: room.name, day: 'Mon', hour: 9 });
    expect(res.status).toBe(400);
  });

  // QUESTION: /api/availability takes no date and ignores bookings – it is only the recurring
  // weekly room_availability grid. Is that what the UI expects? Documented as current behaviour.
  test('availability ignores ?date and does not include bookings (weekly grid only)', async () => {
    const room = await createRoom();
    const slot = futureSlot({ hour: 9 });
    await insertBooking({ room_id: room.id, created_by: rep.user.id, start_time: slot.start, end_time: slot.end });
    await override(admin.auth, { room_name: room.name, day: 'Fri', hour: 16, is_available: false });
    const a = await request(app).get('/api/availability').set('Authorization', rep.auth).query({ date: slot.dateKey });
    const b = await request(app).get('/api/availability').set('Authorization', rep.auth);
    expect(availRows(a.body, room.id)).toEqual(availRows(b.body, room.id));
    expect(availRows(a.body, room.id)).toEqual([expect.objectContaining({ day: 'Fri', hour: 16 })]);
  });

  test('deleting (soft-deleting) a room hides its rows from /availability immediately', async () => {
    const room = await createRoom();
    await override(admin.auth, { room_name: room.name, day: 'Mon', hour: 8, is_available: false });
    expect(availRows((await request(app).get('/api/availability').set('Authorization', rep.auth)).body, room.id)).toHaveLength(1);
    await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth).expect(200);
    expect(availRows((await request(app).get('/api/availability').set('Authorization', rep.auth)).body, room.id)).toHaveLength(0);
  });

  test('renaming a room is reflected in /availability room_name immediately', async () => {
    const room = await createRoom();
    await override(admin.auth, { room_name: room.name, day: 'Mon', hour: 8, is_available: false });
    await request(app).get('/api/availability').set('Authorization', rep.auth);
    const name = `RN-${tag()}`;
    await request(app).patch(`/api/rooms/${room.id}`).set('Authorization', admin.auth)
      .send({ name, capacity: 60, building: room.building, floor: room.floor, type: room.type }).expect(200);
    const after = await request(app).get('/api/availability').set('Authorization', rep.auth);
    expect(availRows(after.body, room.id)[0].room_name).toBe(name);
  });

  test('GET /api/availability/my returns only overrides made by the caller', async () => {
    const me = await createAdmin();
    const other = await createAdmin();
    const r1 = await createRoom();
    const r2 = await createRoom();
    await override(me.auth, { room_name: r1.name, day: 'Mon', hour: 10, is_available: false });
    await override(other.auth, { room_name: r2.name, day: 'Mon', hour: 10, is_available: false });
    const res = await request(app).get('/api/availability/my').set('Authorization', me.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ room_id: r1.id, room_name: r1.name, day: 'Mon', hour: 10, user_id: me.user.id })]);
    expect((await request(app).get('/api/availability/my')).status).toBe(401);
    // Weekly overrides are an admin tool (cras.admin).
    expect((await request(app).get('/api/availability/my').set('Authorization', viewer.auth)).status).toBe(403);
  });
});

// ─── GET /api/rooms/admin/status ─────────────────────────────────────────────
describe('GET /api/rooms/admin/status', () => {
  const status = (auth, query) => request(app).get('/api/rooms/admin/status').set('Authorization', auth).query(query);

  test('401 / 403 for non-admins / 400 when date or slot missing', async () => {
    expect((await request(app).get('/api/rooms/admin/status').query({ date: '2030-01-01', slot: 9 })).status).toBe(401);
    for (const u of [viewer, rep, faculty]) expect((await status(u.auth, { date: '2030-01-01', slot: 9 })).status).toBe(403);
    expect((await status(admin.auth, { slot: 9 })).status).toBe(400);
    const r = await status(admin.auth, { date: '2030-01-01' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Missing date or slot');
  });

  test('lists every room with the ACTIVE booking overlapping that IST hour, nothing for adjacent hours or cancelled bookings', async () => {
    const room = await createRoom();
    const free = await createRoom();
    const cancelledRoom = await createRoom();
    const owner = await createRep();
    const slot = futureSlot({ hour: 13, skip: 1 });
    const b = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, purpose: 'Status check' });
    await insertBooking({ room_id: cancelledRoom.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, status: 'CANCELLED' });

    const res = await status(admin.auth, { date: slot.dateKey, slot: 13 });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.map((r) => [r.room_id, r]));
    expect(byId[room.id]).toMatchObject({ room_name: room.name, booking_id: b.id, purpose: 'Status check', booked_by_name: owner.user.name, booked_by_email: owner.user.email });
    expect(byId[free.id]).toMatchObject({ room_name: free.name, booking_id: null });
    expect(byId[cancelledRoom.id]).toMatchObject({ booking_id: null });

    const next = await status(admin.auth, { date: slot.dateKey, slot: 14 });
    expect(next.body.find((r) => r.room_id === room.id).booking_id).toBeNull();
  });

  test('[NEW-RTT-3] invalid date returns 400 (currently 500 RangeError)', async () => {
    const res = await status(admin.auth, { date: 'not-a-date', slot: 9 });
    expect(res.status).toBe(400);
  });

  test('[BKG-16] a room created by an admin shows up in admin status immediately (cached for 30s)', async () => {
    const date = futureSlot({ hour: 9 }).dateKey;
    await status(admin.auth, { date, slot: 7 });
    const created = await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: `ST-${tag()}`, capacity: 10 });
    expect(created.status).toBe(201);
    const res = await status(admin.auth, { date, slot: 7 });
    expect(res.body.map((r) => r.room_id)).toContain(created.body.id);
  });

  test('[BKG-16] a deleted room disappears from admin status immediately (cached for 30s)', async () => {
    const room = await createRoom();
    const date = futureSlot({ hour: 9 }).dateKey;
    const first = await status(admin.auth, { date, slot: 6 });
    expect(first.body.map((r) => r.room_id)).toContain(room.id);
    await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth).expect(200);
    const res = await status(admin.auth, { date, slot: 6 });
    expect(res.body.map((r) => r.room_id)).not.toContain(room.id);
  });

  // NEW-P2-2: user deactivation cancels the user's upcoming bookings in userRepository.delete, but
  // userService.deleteUser never clears the admin_status_* / room_availability_all caches (room
  // deletion and booking cancel do), so the cancelled booking keeps showing for up to 30s.
  test('[NEW-P2-2] bookings cancelled by deleting their owner disappear from admin status immediately', async () => {
    const room = await createRoom();
    const owner = await createRep();
    const slot = futureSlot({ hour: 15 });
    const b = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end });
    const before = await status(admin.auth, { date: slot.dateKey, slot: 15 });
    expect(before.body.find((r) => r.room_id === room.id).booking_id).toBe(b.id);
    await request(app).delete(`/api/auth/users/${owner.user.id}`).set('Authorization', admin.auth).expect(200);
    expect((await db.query('SELECT status FROM bookings WHERE id = $1', [b.id])).rows[0].status).toBe('CANCELLED');
    const after = await status(admin.auth, { date: slot.dateKey, slot: 15 });
    expect(after.body.find((r) => r.room_id === room.id).booking_id ?? null).toBeNull();
  });

  test('a booking created through the API is reflected in admin status immediately', async () => {
    const room = await createRoom();
    const booker = await createFaculty(); // ACTIVE straight away (a student's request would be PENDING)
    const slot = futureSlot({ hour: 16 });
    await status(admin.auth, { date: slot.dateKey, slot: 16 });
    const b = await request(app).post('/api/bookings').set('Authorization', booker.auth)
      .send({ room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Fresh' });
    expect(b.status).toBe(201);
    const res = await status(admin.auth, { date: slot.dateKey, slot: 16 });
    expect(res.body.find((r) => r.room_id === room.id).booking_id).toBe(b.body.id ?? b.body.booking?.id ?? b.body.data?.id);
  });
});

// ─── GET /api/rooms/:id/week-schedule ────────────────────────────────────────
describe('GET /api/rooms/:id/week-schedule', () => {
  const sched = (auth, id, query) => request(app).get(`/api/rooms/${id}/week-schedule`).set('Authorization', auth).query(query);

  test('401 / 403 non-admin / 400 without weekStart / 404 unknown room', async () => {
    const room = await createRoom();
    expect((await request(app).get(`/api/rooms/${room.id}/week-schedule`).query({ weekStart: '2030-01-07' })).status).toBe(401);
    for (const u of [viewer, rep, faculty]) expect((await sched(u.auth, room.id, { weekStart: '2030-01-07' })).status).toBe(403);
    const missing = await sched(admin.auth, room.id, {});
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('weekStart (YYYY-MM-DD) is required');
    const nf = await sched(admin.auth, 987654321, { weekStart: '2030-01-07' });
    expect(nf.status).toBe(404);
  });

  test('returns room, one block per hour taken by a class (12h → 24h) or an admin block, and only ACTIVE bookings of that IST week', async () => {
    const room = await createRoom({ capacity: 77 });
    const owner = await createRep();
    await db.query("INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1,'Wed',9,false), ($1,'Mon',10,false)", [room.id]);
    await insertFacultySlot({ faculty_name: 'RTT Prof A', day_of_week: 'Mon', slot_time: '10:00-11:00', content: 'Maths', semester: '3', room_id: room.id });
    await insertFacultySlot({ faculty_name: 'RTT Prof B', day_of_week: 'Tue', slot_time: '02:00-03:00', content: 'Physics', semester: '5', room_id: room.id });
    await insertTimetableSlot({ department: `WS-${tag()}`, semester: 4, day_of_week: 'Thu', slot_time: '09:00-11:00', room_id: room.id, subject_name: 'Lab', faculty_name: 'RTT Prof C' });
    const slot = futureSlot({ hour: 10 });
    const active = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, purpose: 'In week' });
    const cancelled = futureSlot({ hour: 12 });
    await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: cancelled.start, end_time: cancelled.end, status: 'CANCELLED' });
    const weekStart = mondayOf(slot.dateKey);

    const res = await sched(admin.auth, room.id, { weekStart });
    expect(res.status).toBe(200);
    expect(res.body.room).toMatchObject({ id: room.id, name: room.name, capacity: 77 });
    const blocks = [...res.body.timetableBlocks].sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour);
    expect(blocks).toEqual([
      { day: 'Mon', hour: 10, faculty: 'RTT Prof A', subject: 'Maths', semester: '3', source: 'class', slotId: expect.any(Number) },
      { day: 'Thu', hour: 9, faculty: 'RTT Prof C', subject: 'Lab', semester: '4', source: 'class', slotId: null },
      { day: 'Thu', hour: 10, faculty: 'RTT Prof C', subject: 'Lab', semester: '4', source: 'class', slotId: null },
      { day: 'Tue', hour: 14, faculty: 'RTT Prof B', subject: 'Physics', semester: '5', source: 'class', slotId: expect.any(Number) },
      { day: 'Wed', hour: 9, source: 'block' },
    ]);
    expect(res.body.bookings).toEqual([expect.objectContaining({
      id: active.id, date: slot.dateKey, startHour: 10, endHour: 11, purpose: 'In week', status: 'ACTIVE',
      bookerName: owner.user.name, bookerEmail: owner.user.email, bookerRole: 'STUDENT_REP',
    })]);

    // A different week does not include the booking
    const other = await sched(admin.auth, room.id, { weekStart: addDays(weekStart, 14) });
    expect(other.body.bookings).toEqual([]);
  });

  test('[NEW-RTT-3] invalid weekStart returns 400 (currently 500 with raw error message)', async () => {
    const room = await createRoom();
    const res = await sched(admin.auth, room.id, { weekStart: 'garbage' });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/rooms/:id/conflict-check ───────────────────────────────────────
describe('GET /api/rooms/:id/conflict-check', () => {
  const check = (auth, id, query) => request(app).get(`/api/rooms/${id}/conflict-check`).set('Authorization', auth).query(query);

  test('401 / 403 for non-admins / 400 for missing params', async () => {
    const room = await createRoom();
    expect((await request(app).get(`/api/rooms/${room.id}/conflict-check`)).status).toBe(401);
    for (const u of [viewer, rep, faculty]) expect((await check(u.auth, room.id, { date: '2030-01-07', startHour: 9, endHour: 10 })).status).toBe(403);
    for (const q of [{ startHour: 9, endHour: 10 }, { date: '2030-01-07', endHour: 10 }, { date: '2030-01-07', startHour: 9 }]) {
      const res = await check(admin.auth, room.id, q);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('date, startHour, endHour are required');
    }
  });

  test('no conflicts on an empty room', async () => {
    const room = await createRoom();
    const res = await check(admin.auth, room.id, { date: futureSlot({ hour: 9 }).dateKey, startHour: 9, endHour: 12 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasConflict: false, conflicts: [] });
  });

  // [BKG-13] conflict-check builds its window with server-local `new Date(y, m, d, h)`; the suite
  // runs with TZ=UTC like production, where the window is 5.5h off and the clashing booking is missed.
  test('[BKG-13] reports timetable and ACTIVE booking conflicts with resolution hints', async () => {
    const room = await createRoom();
    const owner = await createRep();
    const slot = futureSlot({ hour: 10 });
    const fts = await insertFacultySlot({ faculty_name: 'RTT Prof C', day_of_week: slot.day, slot_time: '11:00-12:00', content: 'Chem', room_id: room.id });
    const b = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, purpose: 'Clash' });
    const cancelled = futureSlot({ hour: 9 });
    if (cancelled.dateKey === slot.dateKey) {
      await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: cancelled.start, end_time: cancelled.end, status: 'CANCELLED' });
    }

    const res = await check(admin.auth, room.id, { date: slot.dateKey, startHour: 9, endHour: 12 });
    expect(res.status).toBe(200);
    expect(res.body.hasConflict).toBe(true);
    const tt = res.body.conflicts.filter((c) => c.type === 'timetable');
    expect(tt).toEqual([{
      type: 'timetable', hour: 11, slotId: fts.id, faculty: 'RTT Prof C', subject: 'Chem',
      resolution: 'Remove the timetable slot for this room and hour first.',
    }]);
    const bk = res.body.conflicts.filter((c) => c.type === 'booking');
    expect(bk).toEqual([expect.objectContaining({ bookingId: b.id, booker: owner.user.name, purpose: 'Clash' })]);
    expect(bk[0].resolution).toBe(`Cancel or reschedule booking #${b.id} by ${owner.user.name} first.`);

    // Window that does not touch 10:00-11:00 or the 11:00 block
    const clear = await check(admin.auth, room.id, { date: slot.dateKey, startHour: 12, endHour: 13 });
    expect(clear.body).toEqual({ hasConflict: false, conflicts: [] });
  });

  test('an admin weekly block and a section class are reported; a class released for that date is not', async () => {
    const room = await createRoom();
    const slot = futureSlot({ hour: 10 });
    await db.query('INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1,$2,10,false)', [room.id, slot.day]);
    await insertTimetableSlot({ department: `CC-${tag()}`, day_of_week: slot.day, slot_time: '11:00-01:00', room_id: room.id, subject_name: 'Physics', faculty_name: 'RTT Prof D' });
    await insertRelease({ room_id: room.id, release_date: slot.dateKey, start_hour: 12 });
    const res = await check(admin.auth, room.id, { date: slot.dateKey, startHour: 10, endHour: 13 });
    expect(res.body.conflicts).toEqual([
      { type: 'timetable', hour: 10, slotId: null, faculty: null, subject: 'Blocked by an admin', resolution: 'Lift the weekly block for this room and hour first.' },
      { type: 'timetable', hour: 11, slotId: null, faculty: 'RTT Prof D', subject: 'Physics',
        resolution: 'This is a section class from the timetable import; cancel it for this date or re-import the timetable.' },
    ]);
  });
});


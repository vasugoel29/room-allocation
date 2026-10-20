// Timetable routes: section timetable, admin search, faculty autocomplete/timetable/availability,
// faculty override stubs, admin slot CRUD, bulk upload, debug endpoint.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createFacultyEntry, createViewer, createRoom, insertBooking,
  futureSlot, closeDb,
} from '../../test/helpers/factories.js';

import { insertTimetableSlot } from '../../test/helpers/bookings.js';

afterAll(closeDb);

let n = 0;
const tag = () => `${process.pid.toString(36)}${Date.now().toString(36)}${(n++).toString(36)}`.toUpperCase();

let admin, rep, faculty, viewer;
beforeAll(async () => {
  [admin, rep, faculty, viewer] = await Promise.all([createAdmin(), createRep(), createFaculty(), createViewer()]);
});

const CSE = 'COMPUTER SCIENCE AND ENGINEERING';
const sectionCount = async (dept, sem, sec) => Number((await db.query(
  'SELECT COUNT(*) FROM timetable_slots WHERE UPPER(department) = $1 AND semester = $2 AND section = $3', [dept, String(sem), String(sec)],
)).rows[0].count);

// ─── SEC-11 (fixed) ──────────────────────────────────────────────────────────
describe('GET /api/timetable/inspect-database', () => {
  test('[SEC-11] the debug endpoint is removed (404 for anyone)', async () => {
    expect((await request(app).get('/api/timetable/inspect-database')).status).toBe(404);
  });
});

// ─── GET /api/timetable ──────────────────────────────────────────────────────
describe('GET /api/timetable (own section)', () => {
  test('401 without token', async () => {
    expect((await request(app).get('/api/timetable')).status).toBe(401);
  });

  test('returns exactly the seeded rows for the user\'s branch short code / semester / section', async () => {
    const expected = await sectionCount(CSE, 2, 1);
    expect(expected).toBeGreaterThan(0);
    const u = await createRep({ branch: 'CS', semester: 2, section: 1 });
    const res = await request(app).get('/api/timetable').set('Authorization', u.auth);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(expected);
    for (const row of res.body) {
      expect(row.department.toUpperCase()).toBe(CSE);
      expect(String(row.semester)).toBe('2');
      expect(String(row.section)).toBe('1');
    }
  });

  test('a full department name as branch works too; another section gets a different set', async () => {
    const u = await createViewer({ branch: CSE, semester: 1, section: 2 });
    const res = await request(app).get('/api/timetable').set('Authorization', u.auth);
    expect(res.body).toHaveLength(await sectionCount(CSE, 1, 2));
    expect(res.body.every((r) => String(r.section) === '2' && String(r.semester) === '1')).toBe(true);
  });

  test('legacy token without semester falls back to year * 2', async () => {
    const u = await createRep({ branch: 'CS', year: 1, section: 1 });
    const res = await request(app).get('/api/timetable').set('Authorization', u.auth);
    expect(res.body).toHaveLength(await sectionCount(CSE, 2, 1));
  });

  test('a user without branch/section gets an empty list', async () => {
    const res = await request(app).get('/api/timetable').set('Authorization', viewer.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── GET /api/timetable/search ───────────────────────────────────────────────
describe('GET /api/timetable/search (admin)', () => {
  const search = (auth, q) => request(app).get('/api/timetable/search').set('Authorization', auth).query(q);

  test('401 / 403 for non-admins / 400 for an invalid type', async () => {
    expect((await request(app).get('/api/timetable/search').query({ type: 'FACULTY', name: 'x' })).status).toBe(401);
    for (const u of [viewer, rep, faculty]) expect((await search(u.auth, { type: 'FACULTY', name: 'x' })).status).toBe(403);
    const bad = await search(admin.auth, { type: 'ROOM' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid search type');
  });

  test('FACULTY: static slots by faculty name (case-insensitive) and ACTIVE bookings supervised by them', async () => {
    const name = `RTT Fac ${tag()}`;
    const fac = await createFaculty({ name });
    await db.query("INSERT INTO timetable_slots (department, semester, section, day_of_week, slot_time, subject_name, faculty_name) VALUES ('RTT','1','1','Mon','09:00-10:00','Algo',$1)", [name]);
    const room = await createRoom();
    const student = await createRep();
    const slot = futureSlot({ hour: 11 });
    const active = await insertBooking({ room_id: room.id, created_by: student.user.id, start_time: slot.start, faculty_id: fac.faculty.id, purpose: 'Supervised' });
    const room2 = await createRoom();
    await insertBooking({ room_id: room2.id, created_by: student.user.id, start_time: futureSlot({ hour: 12 }).start, faculty_id: fac.faculty.id, status: 'CANCELLED' });

    const res = await search(admin.auth, { type: 'FACULTY', name: name.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('FACULTY');
    expect(res.body.name).toBe(name.toUpperCase());
    expect(res.body.staticSlots).toEqual([expect.objectContaining({ subject_name: 'Algo', day_of_week: 'Mon' })]);
    expect(res.body.dynamicBookings).toEqual([expect.objectContaining({ id: active.id, room_name: room.name, creator_name: student.user.name })]);
  });

  test('SECTION: static slots for dept/sem/section and ACTIVE bookings by users in that section', async () => {
    const member = await createRep({ branch: 'CS', semester: 4, section: 1 });
    const room = await createRoom();
    const b = await insertBooking({ room_id: room.id, created_by: member.user.id, start_time: futureSlot({ hour: 14 }).start });
    const res = await search(admin.auth, { type: 'SECTION', department: 'CS', semester: 4, section: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'SECTION', department: 'CS', semester: '4', section: '1' });
    expect(res.body.staticSlots).toHaveLength(await sectionCount(CSE, 4, 1));
    expect(res.body.dynamicBookings.map((d) => d.id)).toContain(b.id);
  });

  test('[NEW-RTT-8] FACULTY search without name returns 400 (currently 500 TypeError)', async () => {
    const res = await search(admin.auth, { type: 'FACULTY' });
    expect(res.status).toBe(400);
  });

  test('[NEW-RTT-8] SECTION search without department returns 400 (currently 500 TypeError)', async () => {
    const res = await search(admin.auth, { type: 'SECTION', semester: 1, section: 1 });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/timetable/autocomplete/faculty ─────────────────────────────────
describe('GET /api/timetable/autocomplete/faculty', () => {
  const ac = (auth, query) => request(app).get('/api/timetable/autocomplete/faculty').set('Authorization', auth).query(query);

  test('401 without token; empty query returns []', async () => {
    expect((await request(app).get('/api/timetable/autocomplete/faculty').query({ query: 'a' })).status).toBe(401);
    const res = await ac(viewer.auth, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('merges FACULTY users and timetable names, title-cased and de-duplicated case-insensitively; ignores non-faculty users', async () => {
    const t = tag();
    await createFaculty({ name: `zqx${t} alpha` });
    await db.query("INSERT INTO timetable_slots (department, faculty_name) VALUES ('RTT', $1), ('RTT', $2)", [`ZQX${t} ALPHA`, `zqx${t} beta`]);
    await createRep({ name: `zqx${t} gamma` });
    const res = await ac(rep.auth, { query: `zqx${t}` });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((s) => s.toLowerCase()).sort()).toEqual([`zqx${t} alpha`, `zqx${t} beta`].map((s) => s.toLowerCase()));
    for (const s of res.body) expect(s).toMatch(/^Zqx/); // title case
  });

  test('returns at most 10 names', async () => {
    const t = tag();
    const values = Array.from({ length: 12 }, (_, i) => `('RTT', 'ylw${t} n${String(i).padStart(2, '0')}')`).join(',');
    await db.query(`INSERT INTO timetable_slots (department, faculty_name) VALUES ${values}`);
    const res = await ac(rep.auth, { query: `ylw${t}` });
    expect(res.body).toHaveLength(10);
  });
});

// ─── GET /api/timetable/faculty ──────────────────────────────────────────────
describe('GET /api/timetable/faculty (own faculty timetable)', () => {
  test('401 without sign-in; 403 without cras.timetable / cras.faculty_portal; others see only their own (none)', async () => {
    expect((await request(app).get('/api/timetable/faculty')).status).toBe(401);
    expect((await request(app).get('/api/timetable/faculty').set('Authorization', (await createViewer({ permissions: ['cras.calendar'] })).auth)).status).toBe(403);
    for (const u of [viewer, rep]) {
      const res = await request(app).get('/api/timetable/faculty').set('Authorization', u.auth);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({});
    }
  });

  test('returns only the caller\'s slots (by name, case-insensitive), grouped by day, with room name; ?day filters', async () => {
    const name = `RTT Own ${tag()}`;
    const fac = await createFaculty({ name });
    const room = await createRoom();
    await db.query(
      `INSERT INTO faculty_timetable_slots (faculty_name, day_of_week, slot_time, content, room_id) VALUES
       ($1,'Mon','09:00-10:00','A',$2), ($1,'Mon','10:00-11:00','B',NULL), ($1,'Wed','11:00-12:00','C',NULL), ('Someone Else','Mon','09:00-10:00','X',NULL)`,
      [name.toUpperCase(), room.id],
    );
    const res = await request(app).get('/api/timetable/faculty').set('Authorization', fac.auth);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['Mon', 'Wed']);
    expect(res.body.Mon).toHaveLength(2);
    expect(res.body.Mon.find((s) => s.content === 'A').room_name).toBe(room.name);
    expect(res.body.Wed).toEqual([expect.objectContaining({ content: 'C', room_name: null })]);

    const wed = await request(app).get('/api/timetable/faculty').set('Authorization', fac.auth).query({ day: 'Wed' });
    expect(Object.keys(wed.body)).toEqual(['Wed']);
  });

  test('a faculty with no slots gets {}', async () => {
    const res = await request(app).get('/api/timetable/faculty').set('Authorization', faculty.auth);
    expect(res.body).toEqual({});
  });
});

// ─── GET /api/timetable/faculty/check/:id ────────────────────────────────────
describe('GET /api/timetable/faculty/check/:id', () => {
  const check = (auth, id, q) => request(app).get(`/api/timetable/faculty/check/${id}`).set('Authorization', auth).query(q);
  let fac, slot;
  beforeAll(async () => {
    const name = `RTT Busy ${tag()}`;
    fac = await createFaculty({ name });
    slot = futureSlot({ hour: 10, day: 'Tue' });
    // '01:00-02:00' in the 12h source data means 13:00-14:00
    await db.query("INSERT INTO timetable_slots (department, day_of_week, slot_time, faculty_name) VALUES ('RTT','Tue','01:00-02:00',$1)", [name]);
    await db.query("INSERT INTO faculty_timetable_slots (faculty_name, day_of_week, slot_time, is_occupied) VALUES ($1,'Tue','03:00-04:00',true), ($1,'Tue','04:00-05:00',false)", [name]);
    const room = await createRoom();
    const student = await createRep();
    await insertBooking({ room_id: room.id, created_by: student.user.id, start_time: slot.start, faculty_id: fac.faculty.id });
  });

  test('401 without token; 404 for an id that is not an active faculty-directory entry', async () => {
    expect((await request(app).get(`/api/timetable/faculty/check/${fac.faculty.id}`)).status).toBe(401);
    const inactive = await createFacultyEntry({ is_active: false });
    // A user id (even the faculty member's own account id) is not a directory id.
    for (const id of [rep.user.id, fac.user.id, inactive.id]) {
      const res = await check(rep.auth, id, { date: slot.dateKey, hour: 10 });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Faculty not found');
    }
  });

  test('static timetable class (12h data converted) → occupied, details hidden', async () => {
    const res = await check(rep.auth, fac.faculty.id, { date: slot.dateKey, hour: 13 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ isOccupied: true, reason: 'Static Class', details: null });
  });

  test('occupied faculty_timetable_slots count, unoccupied ones do not', async () => {
    expect((await check(rep.auth, fac.faculty.id, { date: slot.dateKey, hour: 15 })).body.isOccupied).toBe(true);
    expect((await check(rep.auth, fac.faculty.id, { date: slot.dateKey, hour: 16 })).body.isOccupied).toBe(false);
  });

  test('ACTIVE booking supervised by the faculty → Dynamic Booking', async () => {
    const res = await check(rep.auth, fac.faculty.id, { date: slot.dateKey, hour: 10 });
    expect(res.body).toEqual({ isOccupied: true, reason: 'Dynamic Booking', details: null });
  });

  test('a soft-deleted faculty_timetable_slot no longer makes the faculty busy', async () => {
    await db.query("UPDATE faculty_timetable_slots SET is_active = FALSE, deactivated_at = NOW() WHERE UPPER(faculty_name) = UPPER($1) AND slot_time = '03:00-04:00'", [fac.faculty.name]);
    try {
      expect((await check(rep.auth, fac.faculty.id, { date: slot.dateKey, hour: 15 })).body.isOccupied).toBe(false);
    } finally {
      await db.query("UPDATE faculty_timetable_slots SET is_active = TRUE, deactivated_at = NULL WHERE UPPER(faculty_name) = UPPER($1) AND slot_time = '03:00-04:00'", [fac.faculty.name]);
    }
  });

  test('free hour → not occupied', async () => {
    const res = await check(rep.auth, fac.faculty.id, { date: slot.dateKey, hour: 9 });
    expect(res.body).toEqual({ isOccupied: false, reason: null, details: null });
  });

  test('[NEW-RTT-8] missing date/hour returns 400 (currently 500 TypeError)', async () => {
    const res = await check(rep.auth, fac.faculty.id, {});
    expect(res.status).toBe(400);
  });
});

// ─── Faculty "cancel my class" (override) ─────────────────────────────────────
describe('faculty cancels their own class for one date', () => {
  const override = (auth, body) => request(app).post('/api/timetable/faculty/override').set('Authorization', auth).send(body);
  const list = (auth) => request(app).get('/api/timetable/faculty/overrides').set('Authorization', auth);

  async function teaching(dayShort = 'Wed', hour = 11) {
    const fac = await createFaculty();
    const room = await createRoom();
    const slot = futureSlot({ hour, day: dayShort, minLeadHours: 0 });
    const pad = (h) => String(h > 12 ? h - 12 : h).padStart(2, '0');
    await insertTimetableSlot({
      department: `OVR ${tag()}`, semester: 3, section: 1, day_of_week: dayShort,
      slot_time: `${pad(hour)}:00-${pad(hour + 1)}:00`, room_name: room.name, faculty_name: fac.user.name, subject_name: 'Networks',
    });
    return { fac, room, slot };
  }

  test('cancel → recorded, listed, and the room is released for that date and hour only', async () => {
    const { fac, room, slot } = await teaching('Wed', 11);
    const res = await override(fac.auth, { date: slot.dateKey, hour: 11 });
    expect(res.status).toBe(200);
    expect(res.body.override).toMatchObject({ date: slot.dateKey, hour: 11, is_cancelled: true });
    expect((await list(fac.auth)).body).toEqual([expect.objectContaining({ date: slot.dateKey, hour: 11, is_cancelled: true })]);
    const { rows } = await db.query(
      `SELECT release_date::text AS d, start_hour, end_hour FROM room_slot_releases WHERE room_id = $1 AND is_active`, [room.id],
    );
    expect(rows).toEqual([{ d: slot.dateKey, start_hour: 11, end_hour: 12 }]);
    // The room can now be booked at that hour on that date (a staff booking, so no approval step).
    const booked = await request(app).post('/api/bookings').set('Authorization', (await createFaculty()).auth)
      .send({ room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Using the freed room' });
    expect(booked.status).toBe(201);
  });

  test('the faculty member is no longer "busy" at that hour for approvals', async () => {
    const { fac, slot } = await teaching('Thu', 14);
    const rep2 = await createRep();
    const other = await createRoom();
    const before = await request(app).post('/api/bookings').set('Authorization', rep2.auth)
      .send({ room_id: other.id, start_time: slot.start, end_time: slot.end, purpose: 'x', faculty_id: fac.faculty.id });
    expect(before.status).toBe(409);
    expect(before.body.conflict).toEqual({ type: 'faculty_busy' });
    await override(fac.auth, { date: slot.dateKey, hour: 14 });
    const after = await request(app).post('/api/bookings').set('Authorization', rep2.auth)
      .send({ room_id: other.id, start_time: slot.start, end_time: slot.end, purpose: 'x', faculty_id: fac.faculty.id });
    expect(after.status).toBe(201);
  });

  test('restoring (is_cancelled=false) withdraws the release', async () => {
    const { fac, room, slot } = await teaching('Tue', 10);
    await override(fac.auth, { date: slot.dateKey, hour: 10 });
    const res = await override(fac.auth, { date: slot.dateKey, hour: 10, is_cancelled: false });
    expect(res.status).toBe(200);
    expect((await list(fac.auth)).body).toEqual([]);
    expect((await db.query('SELECT 1 FROM room_slot_releases WHERE room_id = $1 AND is_active', [room.id])).rowCount).toBe(0);
  });

  test('refused when they have no class then (404), in the past (400), or with bad input (400)', async () => {
    const { fac, slot } = await teaching('Mon', 9);
    expect((await override(fac.auth, { date: slot.dateKey, hour: 15 })).status).toBe(404);
    expect((await override((await createFaculty()).auth, { date: slot.dateKey, hour: 9 })).status).toBe(404);
    expect((await override(fac.auth, { date: '2024-01-08', hour: 9 })).status).toBe(400);
    expect((await override(fac.auth, { date: '2030-02-30', hour: 9 })).status).toBe(400);
    expect((await override(fac.auth, { date: slot.dateKey, hour: 30 })).status).toBe(400);
  });

  test('requires FACULTY', async () => {
    expect((await request(app).post('/api/timetable/faculty/override')).status).toBe(401);
    expect((await override(rep.auth, {})).status).toBe(403);
    expect((await list(rep.auth)).status).toBe(403);
  });
});

// ─── Admin slot CRUD ─────────────────────────────────────────────────────────
describe('/api/timetable/slots (admin CRUD on faculty_timetable_slots)', () => {
  const slotsApi = (method, path, auth) => request(app)[method](`/api/timetable/slots${path}`).set('Authorization', auth);

  test('401 and 403 for every non-admin role on every verb', async () => {
    expect((await request(app).get('/api/timetable/slots')).status).toBe(401);
    for (const u of [viewer, rep, faculty]) {
      expect((await slotsApi('get', '', u.auth)).status).toBe(403);
      expect((await slotsApi('post', '', u.auth).send({ faculty_name: 'x', day_of_week: 'Mon', slot_time: '09:00-10:00' })).status).toBe(403);
      expect((await slotsApi('patch', '/1', u.auth).send({ content: 'x' })).status).toBe(403);
      expect((await slotsApi('delete', '/1', u.auth)).status).toBe(403);
    }
  });

  test('create: 400 when a required field is missing; 201 with defaults', async () => {
    for (const body of [{ day_of_week: 'Mon', slot_time: '9' }, { faculty_name: 'x', slot_time: '9' }, { faculty_name: 'x', day_of_week: 'Mon' }]) {
      const res = await slotsApi('post', '', admin.auth).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('faculty_name, day_of_week, and slot_time are required');
    }
    const res = await slotsApi('post', '', admin.auth).send({ faculty_name: `RTT Slot ${tag()}`, day_of_week: 'Mon', slot_time: '09:00-10:00' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ semester: '', content: '', is_occupied: false, room_id: null, id: expect.any(Number) });
  });

  test('list: filters by faculty_name (ILIKE), day and semester, paginates with meta', async () => {
    const name = `RTT List ${tag()}`;
    const room = await createRoom();
    for (const [day, time, sem] of [['Mon', '09:00-10:00', '3'], ['Mon', '10:00-11:00', '3'], ['Tue', '09:00-10:00', '5']]) {
      await slotsApi('post', '', admin.auth).send({ faculty_name: name, day_of_week: day, slot_time: time, semester: sem, room_id: room.id }).expect(201);
    }
    const all = await slotsApi('get', '', admin.auth).query({ faculty_name: name.toLowerCase() });
    expect(all.status).toBe(200);
    expect(all.body.meta).toEqual({ total: 3, page: 1, limit: 50 });
    expect(all.body.data[0]).toMatchObject({ faculty_name: name, room_id: room.id, room_name: room.name });

    const mon = await slotsApi('get', '', admin.auth).query({ faculty_name: name, day_of_week: 'mon' });
    expect(mon.body.data).toHaveLength(2);
    const sem5 = await slotsApi('get', '', admin.auth).query({ faculty_name: name, semester: '5' });
    expect(sem5.body.data).toEqual([expect.objectContaining({ day_of_week: 'Tue' })]);
    const p2 = await slotsApi('get', '', admin.auth).query({ faculty_name: name, page: 2, limit: 2 });
    expect(p2.body.data).toHaveLength(1);
    expect(p2.body.meta).toEqual({ total: 3, page: 2, limit: 2 });
  });

  test('update: partial fields are kept (COALESCE); explicit room_id is applied; 404 for unknown id', async () => {
    const room = await createRoom();
    const created = (await slotsApi('post', '', admin.auth).send({ faculty_name: `RTT Upd ${tag()}`, day_of_week: 'Mon', slot_time: '09:00-10:00', content: 'Old', semester: '3' })).body;
    const res = await slotsApi('patch', `/${created.id}`, admin.auth).send({ content: 'New', room_id: room.id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ faculty_name: created.faculty_name, day_of_week: 'Mon', slot_time: '09:00-10:00', semester: '3', content: 'New', room_id: room.id });
    const nf = await slotsApi('patch', '/987654321', admin.auth).send({ content: 'x' });
    expect(nf.status).toBe(404);
    expect(nf.body.error).toBe('Slot not found');
  });

  test('[OPS-12] updating a slot without room_id keeps its room (currently nulled)', async () => {
    const room = await createRoom();
    const created = (await slotsApi('post', '', admin.auth).send({ faculty_name: `RTT O12 ${tag()}`, day_of_week: 'Mon', slot_time: '09:00-10:00', room_id: room.id })).body;
    expect(created.room_id).toBe(room.id);
    const res = await slotsApi('patch', `/${created.id}`, admin.auth).send({ content: 'Only content changed' });
    expect(res.status).toBe(200);
    expect(res.body.room_id).toBe(room.id);
  });

  test('delete: 200 then 404; row soft-deleted (is_active=false, deactivated_at), hidden from the list, not updatable', async () => {
    const fname = `RTT Del ${tag()}`;
    const created = (await slotsApi('post', '', admin.auth).send({ faculty_name: fname, day_of_week: 'Mon', slot_time: '09:00-10:00' })).body;
    const res = await slotsApi('delete', `/${created.id}`, admin.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const { rows: [row] } = await db.query('SELECT * FROM faculty_timetable_slots WHERE id = $1', [created.id]);
    expect(row).toMatchObject({ id: created.id, faculty_name: fname, is_active: false });
    expect(row.deactivated_at).not.toBeNull();
    const list = await request(app).get('/api/timetable/slots').query({ faculty_name: fname }).set('Authorization', admin.auth);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(fname);
    expect((await slotsApi('patch', `/${created.id}`, admin.auth).send({ content: 'revived?' })).status).toBe(404);
    expect((await slotsApi('delete', `/${created.id}`, admin.auth)).status).toBe(404);
  });
});

// ─── POST /api/timetable/upload ──────────────────────────────────────────────
describe('POST /api/timetable/upload', () => {
  const upload = (auth, body) => request(app).post('/api/timetable/upload').set('Authorization', auth).send(body);
  const mkSlots = (dept) => [
    { department: dept, semester: '1', section: '1', day_of_week: 'Mon', slot_time: '09:00-10:00', subject_name: 'A', room_name: 'R1', subject_code: 'A1', faculty_name: 'F1' },
    { department: dept, semester: '1', section: '1', day_of_week: 'Tue', slot_time: '10:00-11:00', subject_name: 'B', room_name: 'R2', subject_code: 'B1', faculty_name: 'F2' },
  ];
  const countDept = async (dept) => Number((await db.query('SELECT COUNT(*) FROM timetable_slots WHERE department = $1', [dept])).rows[0].count);

  test('401 / 403 for non-admins / 400 when slots is not an array', async () => {
    expect((await request(app).post('/api/timetable/upload').send({ slots: [] })).status).toBe(401);
    for (const u of [viewer, rep, faculty]) expect((await upload(u.auth, { slots: [] })).status).toBe(403);
    for (const body of [{}, { slots: 'x' }, { slots: { a: 1 } }]) {
      const res = await upload(admin.auth, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid data format');
    }
  });

  test('inserts every slot', async () => {
    const dept = `RTT-UP-${tag()}`;
    const res = await upload(admin.auth, { slots: mkSlots(dept) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Timetable uploaded successfully', inserted: 2, skipped: 0 });
    const { rows } = await db.query('SELECT day_of_week, subject_name, faculty_name FROM timetable_slots WHERE department = $1 ORDER BY day_of_week', [dept]);
    expect(rows).toEqual([
      { day_of_week: 'Mon', subject_name: 'A', faculty_name: 'F1' },
      { day_of_week: 'Tue', subject_name: 'B', faculty_name: 'F2' },
    ]);
  });

  test('the upload is all-or-nothing: a bad row rolls back the whole batch', async () => {
    const dept = `RTT-UP-${tag()}`;
    const slots = Array.from({ length: 250 }, (_, i) => ({ ...mkSlots(dept)[0], subject_code: `C${i}` }));
    slots[220].subject_name = 'bad\u0000byte'; // NUL is rejected by Postgres → second chunk fails
    const res = await upload(admin.auth, { slots });
    expect(res.status).toBe(500);
    expect(await countDept(dept)).toBe(0);
  });

  test('[OPS-14] re-posting the same timetable does not duplicate rows', async () => {
    const dept = `RTT-UP-${tag()}`;
    await upload(admin.auth, { slots: mkSlots(dept) }).expect(200);
    await upload(admin.auth, { slots: mkSlots(dept) }).expect(200);
    expect(await countDept(dept)).toBe(2);
  });
});

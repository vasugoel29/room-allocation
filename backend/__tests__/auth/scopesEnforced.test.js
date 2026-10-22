// ACL scopes are enforced (decision 2026-10-22): people (department, branch, semester, section) and
// rooms (building, room). Unscoped grants behave exactly as before (every other test file).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createUser, createAdmin, createRep, createFaculty, createRoom, insertBooking, futureSlot, closeDb } from '../../test/helpers/factories.js';
import { insertTimetableSlot, plusHours, uniq } from '../../test/helpers/bookings.js';
import { SUGGESTED_BUNDLES } from '../../src/auth/permissions.js';

afterAll(closeDb);

const tag = uniq('S').toUpperCase();
const BLD_A = `Block A ${tag}`;
const BLD_B = `Block B ${tag}`;
const IT = `IT ${tag}`;
const CSE = `CSE ${tag}`;

let roomA, roomB, itRep, cseRep, faculty;
beforeAll(async () => {
  [roomA, roomB] = await Promise.all([createRoom({ building: BLD_A }), createRoom({ building: BLD_B })]);
  [itRep, cseRep] = await Promise.all([
    createRep({ branch: IT, semester: 5, section: 1 }), createRep({ branch: CSE, semester: 3, section: 2 }),
  ]);
  faculty = await createFaculty();
});

const get = (auth, path, query = {}) => request(app).get(path).set('Authorization', auth).query(query);
const ids = (rows) => rows.map((r) => r.id ?? r.room_id);

describe('room scopes (calendar and booking)', () => {
  test('a calendar scoped to one building lists only its rooms, availability and bookings', async () => {
    const viewer = await createUser({ role: 'VIEWER', scopes: { 'cras.calendar': [{ building: BLD_A }] } });
    const rooms = ids((await get(viewer.auth, '/api/rooms', { building: [BLD_A, BLD_B].join(',') })).body);
    expect(rooms).toContain(roomA.id);
    expect(rooms).not.toContain(roomB.id);

    const slot = futureSlot({ hour: 15 });
    const inA = await insertBooking({ room_id: roomA.id, created_by: itRep.user.id, start_time: slot.start });
    const inB = await insertBooking({ room_id: roomB.id, created_by: cseRep.user.id, start_time: slot.start });
    const cal = await get(viewer.auth, '/api/bookings/calendar', { from: slot.dateKey, to: slot.dateKey });
    expect(ids(cal.body.data)).toContain(inA.id);
    expect(ids(cal.body.data)).not.toContain(inB.id);

    await db.query("INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Mon', 9, false), ($2, 'Mon', 9, false)", [roomA.id, roomB.id]);
    await request(app).post('/api/availability/override').set('Authorization', (await createAdmin()).auth)
      .send({ room_name: roomA.name, day: 'Tue', hour: 9, is_available: false }); // clears the cache
    const avail = (await get(viewer.auth, '/api/availability')).body.map((r) => r.room_id);
    expect(avail).toContain(roomA.id);
    expect(avail).not.toContain(roomB.id);
  });

  test('cras.bookings scoped to a building: book there, 403 elsewhere', async () => {
    const rep = await createUser({ role: 'STUDENT_REP', scopes: { 'cras.bookings': [{ building: BLD_A }] } });
    const slot = futureSlot({ hour: 16 });
    const body = (room) => ({ room_id: room.id, start_time: slot.start, end_time: plusHours(slot.start), purpose: 'x', faculty_id: faculty.faculty.id });
    expect((await request(app).post('/api/bookings').set('Authorization', rep.auth).send(body(roomA))).status).toBe(201);
    const out = await request(app).post('/api/bookings').set('Authorization', rep.auth).send(body(roomB));
    expect(out.status).toBe(403);
    expect(out.body.error).toMatch(/outside your access scope/);
  });
});

describe('an admin scoped to one branch (people)', () => {
  let admin;
  beforeAll(async () => {
    admin = await createUser({ role: 'ADMIN', permissions: SUGGESTED_BUNDLES.ADMIN, scopes: { 'cras.admin': [{ branch: IT }] } });
  });

  test('sees and manages only those people', async () => {
    const find = async (u) => (await get(admin.auth, '/api/auth/users', { search: u.user.email })).body.data.map((x) => x.id);
    expect(await find(itRep)).toEqual([itRep.user.id]);
    expect(await find(cseRep)).toEqual([]);
    expect((await request(app).delete(`/api/auth/users/${cseRep.user.id}`).set('Authorization', admin.auth)).status).toBe(403);

    const slot = futureSlot({ hour: 17 });
    const mine = await insertBooking({ room_id: roomA.id, created_by: itRep.user.id, start_time: slot.start });
    const theirs = await insertBooking({ room_id: roomB.id, created_by: cseRep.user.id, start_time: slot.start });
    const all = ids((await get(admin.auth, '/api/bookings/admin/all', { limit: 1000 })).body.data);
    expect(all).toContain(mine.id);
    expect(all).not.toContain(theirs.id);
    expect((await request(app).patch(`/api/bookings/${theirs.id}/cancel`).set('Authorization', admin.auth)).status).toBe(403);
    expect((await request(app).patch(`/api/bookings/${mine.id}/cancel`).set('Authorization', admin.auth)).status).toBe(200);

    const csv = await get(admin.auth, '/api/admin/export/bookings');
    expect(csv.text).not.toContain(cseRep.user.name);
  });

  test('quick book only for people in scope', async () => {
    const slot = futureSlot({ hour: 12, skip: 1 });
    const quick = (target) => request(app).post('/api/bookings/admin/quick').set('Authorization', admin.auth)
      .send({ room_name: roomA.name, date: slot.dateKey, slot: 12, target_user_id: target.user.id });
    expect((await quick(cseRep)).status).toBe(403);
    expect((await quick(itRep)).status).toBe(201);
  });

  test('timetable: section search, import and the branch list follow the scope', async () => {
    await insertTimetableSlot({ department: IT, semester: 5, section: 1 });
    await insertTimetableSlot({ department: CSE, semester: 3, section: 2 });
    const search = (department, semester, section) => get(admin.auth, '/api/timetable/search', { type: 'SECTION', department, semester, section });
    expect((await search(IT, 5, 1)).status).toBe(200);
    expect((await search(CSE, 3, 2)).status).toBe(403);

    const branches = (await get(admin.auth, '/api/timetable/branches')).body;
    expect(branches).toContain(IT.toUpperCase());
    expect(branches).not.toContain(CSE.toUpperCase());

    const slot = (department) => ({ department, semester: 5, section: 1, day_of_week: 'Mon', slot_time: '09:00-10:00', subject_name: 'X' });
    const up = await request(app).post('/api/timetable/upload').set('Authorization', admin.auth).send({ slots: [slot(IT), slot(CSE)] });
    expect(up.status).toBe(403);
    expect(up.body.error).toContain(CSE.toUpperCase());
    expect((await request(app).post('/api/timetable/upload').set('Authorization', admin.auth).send({ slots: [slot(IT)] })).status).toBe(200);
  });

  test('whole-campus CSV imports need an unscoped admin', async () => {
    const res = await request(app).post('/api/admin/uploads/import/faculty').set('Authorization', admin.auth).send({ csvContent: 'name,email\n' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/whole campus/);
  });
});

describe('an admin scoped to one building (rooms)', () => {
  let admin;
  beforeAll(async () => {
    admin = await createUser({ role: 'ADMIN', permissions: SUGGESTED_BUNDLES.ADMIN, scopes: { 'cras.admin': [{ building: BLD_A }] } });
  });

  test('manages only those rooms', async () => {
    expect((await request(app).patch(`/api/rooms/${roomB.id}`).set('Authorization', admin.auth).send({ capacity: 5 })).status).toBe(403);
    expect((await request(app).patch(`/api/rooms/${roomA.id}`).set('Authorization', admin.auth).send({ capacity: 55 })).status).toBe(200);
    expect((await request(app).patch(`/api/rooms/${roomA.id}`).set('Authorization', admin.auth).send({ building: BLD_B })).status).toBe(403);
    expect((await request(app).post('/api/rooms').set('Authorization', admin.auth).send({ name: uniq('R').slice(0, 30), capacity: 10, building: BLD_B })).status).toBe(403);
    expect((await get(admin.auth, `/api/rooms/${roomB.id}/week-schedule`, { weekStart: '2030-01-07' })).status).toBe(403);
    expect((await request(app).post('/api/availability/override').set('Authorization', admin.auth)
      .send({ room_name: roomB.name, day: 'Mon', hour: 10, is_available: false })).status).toBe(403);
    expect((await request(app).delete(`/api/rooms/${roomB.id}`).set('Authorization', admin.auth)).status).toBe(403);
  });
});

test('the catalog publishes the scope keys for the ACL team', async () => {
  const res = await request(app).get('/api/permissions/catalog');
  expect(Object.keys(res.body.scopes.keys)).toEqual(['department', 'branch', 'semester', 'section', 'building', 'room']);
  expect(res.body.scopes.applies['cras.admin']).toMatch(/whole-campus/);
});

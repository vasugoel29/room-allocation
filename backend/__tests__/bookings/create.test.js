import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createUser, createAdmin, createRep, createFaculty, createFacultyEntry, createViewer, createRoom, insertBooking,
  futureSlot, pastSlot, tokenFor, approverId, closeDb,
} from '../../test/helpers/factories.js';
import {
  uniq, plusHours, ist, pastWeekdaySlot, farWeekdaySlot, getBooking, auditRows, insertTimetableSlot, waitFor, insertRelease,
} from '../../test/helpers/bookings.js';
import { getIstParts } from '../../src/utils/timezone.js';

afterAll(closeDb);

const post = (auth, body) => {
  const r = request(app).post('/api/bookings');
  if (auth) r.set('Authorization', auth);
  return r.send(body);
};
const body = (room, slot, extra = {}) => ({
  room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Club meeting', ...extra,
});
/** A student's request: students must name the approving faculty member (a fresh directory entry). */
const studentBody = async (room, slot, extra = {}) => body(room, slot, { faculty_id: await approverId(), ...extra });
const MUST_NAME_FACULTY = { error: 'Choose the faculty member who will approve this booking' };

describe('POST /api/bookings — success', () => {
  test('FACULTY books a free room: 201, ACTIVE row persisted (no approval needed), audit CREATE_BOOKING', async () => {
    const rep = await createFaculty();
    const room = await createRoom();
    const slot = futureSlot({ hour: 10 });
    const res = await post(rep.auth, body(room, slot));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      room_id: room.id, created_by: rep.user.id, purpose: 'Club meeting', status: 'ACTIVE', faculty_id: null,
    });
    expect(new Date(res.body.start_time).toISOString()).toBe(slot.start);
    expect(new Date(res.body.end_time).toISOString()).toBe(slot.end);

    const row = await getBooking(res.body.id);
    expect(row.status).toBe('ACTIVE');
    expect(row.cancelled_at).toBeNull();

    const audit = await auditRows(res.body.id, 'CREATE_BOOKING');
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(rep.user.id);
    expect(audit[0].details).toMatchObject({ room_id: room.id, start_time: slot.start, end_time: slot.end });

    // Universal mutation-audit middleware also logs the request (async, on response finish)
    const mw = await waitFor(async () => (await db.query(
      `SELECT * FROM audit_logs WHERE action = 'POST_API_BOOKINGS' AND user_id = $1`, [rep.user.id])).rows[0]);
    expect(mw).toBeTruthy();
    expect(mw.details).toMatchObject({ method: 'POST', status: 201 });
  });

  test('with faculty_id the booking is PENDING and audited as REQUEST_BOOKING', async () => {
    const rep = await createRep();
    const fac = await createFaculty();
    const room = await createRoom();
    const slot = futureSlot({ hour: 11 });
    const res = await post(rep.auth, body(room, slot, { faculty_id: fac.faculty.id }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', faculty_id: fac.faculty.id, created_by: rep.user.id });
    expect((await getBooking(res.body.id)).status).toBe('PENDING');
    expect(await auditRows(res.body.id, 'REQUEST_BOOKING')).toHaveLength(1);
    expect(await auditRows(res.body.id, 'CREATE_BOOKING')).toHaveLength(0);
  });

  // BKG-10 (fixed): faculty approval is mandatory for students.
  test('[BKG-10] a student omitting faculty_id (missing, null or empty) → 400, nothing inserted', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const slot = futureSlot({ hour: 12 });
    for (const extra of [{}, { faculty_id: null }, { faculty_id: '' }]) {
      const res = await post(rep.auth, body(room, slot, extra));
      expect(res.status).toBe(400);
      expect(res.body).toEqual(MUST_NAME_FACULTY);
    }
    expect((await db.query('SELECT 1 FROM bookings WHERE created_by = $1', [rep.user.id])).rows).toHaveLength(0);
  });

  test('FACULTY and ADMIN can book without a faculty_id: ACTIVE immediately', async () => {
    const fac = await createFaculty();
    const admin = await createAdmin();
    const room = await createRoom();
    const r1 = await post(fac.auth, body(room, futureSlot({ hour: 13 })));
    const r2 = await post(admin.auth, body(room, futureSlot({ hour: 14 })));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body).toMatchObject({ created_by: fac.user.id, status: 'ACTIVE', faculty_id: null });
    expect(r2.body).toMatchObject({ created_by: admin.user.id, status: 'ACTIVE', faculty_id: null });
  });

  test('a FACULTY booking that names a supervising faculty is still ACTIVE immediately (faculty_id kept)', async () => {
    const fac = await createFaculty();
    const supervisor = await createFacultyEntry();
    const res = await post(fac.auth, body(await createRoom(), futureSlot({ hour: 15 }), { faculty_id: supervisor.id }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'ACTIVE', faculty_id: supervisor.id });
    expect(await auditRows(res.body.id, 'CREATE_BOOKING')).toHaveLength(1);
  });

  test('a slot that has already started is refused (no current-slot grace any more)', async () => {
    const admin = await createAdmin(); // admin: avoids weekend/window rules on whatever day today is
    const room = await createRoom();
    const { start } = pastSlot(0); // the current IST hour, started up to 59 minutes ago
    const res = await post(admin.auth, { room_id: room.id, start_time: start, end_time: plusHours(start), purpose: 'Now' });
    expect(res.status).toBe(400);
    const h = getIstParts(start).hour;
    // Outside 08:00–20:00 the opening-hours rule is reported first.
    expect(res.body.error).toBe(h === 23 ? 'A booking must start and end on the same day'
      : h >= 8 && h < 20 ? 'Cannot book in the past' : 'Rooms can be booked between 08:00 and 20:00');
  });

  test('purpose is trimmed', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const res = await post(rep.auth, await studentBody(room, futureSlot({ hour: 15 }), { purpose: '   Spaced   ' }));
    expect(res.status).toBe(201);
    expect(res.body.purpose).toBe('Spaced');
  });
});

describe('POST /api/bookings — authN / authZ', () => {
  test('no token → 401', async () => {
    const res = await post(null, {});
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing or invalid token' });
  });

  test('bad / expired / wrong-secret token → 401', async () => {
    const rep = await createRep();
    for (const auth of [
      'Bearer garbage',
      `Bearer ${tokenFor(rep.user, { expiresIn: -10 })}`,
      'Token abc',
    ]) {
      const res = await post(auth, {});
      expect(res.status).toBe(401);
    }
  });

  test('VIEWER → 403 and no booking created', async () => {
    const viewer = await createViewer();
    const room = await createRoom();
    const res = await post(viewer.auth, body(room, futureSlot({ hour: 10 })));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    const { rows } = await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id]);
    expect(rows).toHaveLength(0);
  });

  test('unknown role in token → 403', async () => {
    const u = await createUser({ role: 'SUPERUSER' });
    const room = await createRoom();
    const res = await post(u.auth, body(room, futureSlot({ hour: 10 })));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/bookings — validation', () => {
  let rep; let room; let slot; let facultyId;
  beforeAll(async () => {
    rep = await createRep();
    room = await createRoom();
    slot = futureSlot({ hour: 16 });
    facultyId = await approverId();
  });

  test.each([
    ['missing room_id', (b) => { delete b.room_id; }, 'Valid room ID required'],
    ['non-integer room_id', (b) => { b.room_id = 'abc'; }, 'Valid room ID required'],
    ['missing start_time', (b) => { delete b.start_time; }, 'Valid start time required'],
    ['invalid start_time', (b) => { b.start_time = 'tomorrow'; }, 'Valid start time required'],
    ['missing end_time', (b) => { delete b.end_time; }, 'Valid end time required'],
    ['invalid end_time', (b) => { b.end_time = '2026-99-99'; }, 'Valid end time required'],
    ['missing purpose', (b) => { delete b.purpose; }, 'Invalid value'],
    ['whitespace purpose', (b) => { b.purpose = '   '; }, 'Invalid value'],
    ['purpose > 100 chars', (b) => { b.purpose = 'x'.repeat(101); }, 'Purpose must be between 1 and 100 characters'],
  ])('%s → 400', async (_name, mutate, msg) => {
    const b = body(room, slot, { faculty_id: facultyId });
    mutate(b);
    const res = await post(rep.auth, b);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  test('purpose of exactly 100 chars is accepted', async () => {
    const res = await post(rep.auth, body(room, slot, { purpose: 'p'.repeat(100), faculty_id: facultyId }));
    expect(res.status).toBe(201);
  });

  test('non-existent room → 404', async () => {
    const res = await post(rep.auth, body({ id: 2147483000 }, futureSlot({ hour: 9 })));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Room not found' });
  });
});

describe('POST /api/bookings — time rules', () => {
  test('past booking → 400 for students, faculty and admins', async () => {
    const room = await createRoom();
    const slot = pastWeekdaySlot(10);
    for (const who of [await createRep(), await createFaculty(), await createAdmin()]) {
      const res = await post(who.auth, body(room, slot));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Cannot book in the past' });
    }
    const p = pastSlot(5);
    const res = await post((await createAdmin()).auth, body(room, p));
    expect(res.status).toBe(400);
  });

  test('more than 7 days ahead → 400 for STUDENT_REP and FACULTY, allowed for ADMIN', async () => {
    const room = await createRoom();
    const slot = farWeekdaySlot(10);
    for (const who of [await createRep(), await createFaculty()]) {
      const res = await post(who.auth, body(room, slot));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Regular bookings allowed only for the current week' });
    }
    const admin = await createAdmin();
    const res = await post(admin.auth, body(room, slot));
    expect(res.status).toBe(201);
  });

  test('weekend (IST) → 400 for STUDENT_REP, allowed for FACULTY and ADMIN', async () => {
    const room = await createRoom();
    const sat = futureSlot({ hour: 10, weekend: true });
    const rep = await createRep();
    const res = await post(rep.auth, body(room, sat));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Students are not allowed to book rooms on weekends' });

    const fac = await createFaculty();
    expect((await post(fac.auth, body(room, sat))).status).toBe(201);
    const admin = await createAdmin();
    const sat2 = { start: plusHours(sat.start, 2), end: plusHours(sat.start, 3) };
    expect((await post(admin.auth, body(room, sat2))).status).toBe(201);
  });

  // Mon 01:00 IST (Sun 19:30 UTC) used to probe the IST weekend rule; it is now outside opening hours.
  // (Within 08:00–20:00 IST the IST and UTC calendar days always agree.)
  test('Mon 01:00 IST is refused for being outside opening hours, not as a weekend booking', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const mon = futureSlot({ hour: 1, day: 'Mon', minLeadHours: 0 });
    const res = await post(rep.auth, await studentBody(room, mon));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Rooms can be booked between 08:00 and 20:00' });
  });

  test('Mon 08:00 IST (02:30 UTC) is a weekday for students', async () => {
    const rep = await createRep();
    const mon = futureSlot({ hour: 8, day: 'Mon' });
    const res = await post(rep.auth, await studentBody(await createRoom(), mon));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
  });
});

describe('POST /api/bookings — room restrictions', () => {
  test.each(['Committee Room', 'Auditorium'])('%s: STUDENT_REP → 403, FACULTY and ADMIN → 201', async (type) => {
    const room = await createRoom({ type });
    const rep = await createRep();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 10 })));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Committee Rooms and Auditoriums can only be booked by Faculty or Admin' });

    expect((await post((await createFaculty()).auth, body(room, futureSlot({ hour: 11 })))).status).toBe(201);
    expect((await post((await createAdmin()).auth, body(room, futureSlot({ hour: 12 })))).status).toBe(201);
  });

  test('student_access=false: STUDENT_REP → 403, FACULTY/ADMIN → 201', async () => {
    const room = await createRoom({ student_access: false });
    const rep = await createRep();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 10 })));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Students do not have permission to book this room' });
    const { rows } = await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id]);
    expect(rows).toHaveLength(0);

    expect((await post((await createFaculty()).auth, body(room, futureSlot({ hour: 11 })))).status).toBe(201);
    expect((await post((await createAdmin()).auth, body(room, futureSlot({ hour: 12 })))).status).toBe(201);
  });
});

describe('POST /api/bookings — conflicts', () => {
  test('room already ACTIVE-booked for an overlapping period → 409, nothing inserted', async () => {
    const room = await createRoom();
    const owner = await createRep();
    const slot = futureSlot({ hour: 10 });
    await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: plusHours(slot.start, 2) });

    const rep = await createRep();
    for (const s of [slot, { start: plusHours(slot.start, 1), end: plusHours(slot.start, 2) },
      { start: plusHours(slot.start, -1), end: plusHours(slot.start, 1) }]) {
      const res = await post(rep.auth, await studentBody(room, s));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Room is already booked for this time period', conflict: { type: 'room_booked' } });
    }
    const { rows } = await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id]);
    expect(rows).toHaveLength(1);
  });

  test('adjacent slots (end == next start) do not conflict', async () => {
    const room = await createRoom();
    const fac = await createFaculty(); // ACTIVE bookings: the ones that block a room
    const slot = futureSlot({ hour: 10 });
    expect((await post(fac.auth, body(room, slot))).status).toBe(201);
    const next = { start: slot.end, end: plusHours(slot.end) };
    expect((await post((await createFaculty()).auth, body(room, next))).status).toBe(201);
    const prev = { start: plusHours(slot.start, -1), end: slot.start };
    expect((await post(fac.auth, body(room, prev))).status).toBe(201);
  });

  test('CANCELLED / REJECTED bookings do not block the room', async () => {
    const room = await createRoom();
    const other = await createRep();
    const slot = futureSlot({ hour: 13 });
    await insertBooking({ room_id: room.id, created_by: other.user.id, start_time: slot.start, status: 'CANCELLED' });
    await insertBooking({ room_id: room.id, created_by: other.user.id, start_time: slot.start, status: 'REJECTED' });
    const res = await post((await createFaculty()).auth, body(room, slot));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  test('user double-booking in another room → 409 naming the other room', async () => {
    const fac = await createFaculty();
    const roomA = await createRoom();
    const roomB = await createRoom();
    const slot = futureSlot({ hour: 14 });
    expect((await post(fac.auth, body(roomA, slot))).status).toBe(201);
    const res = await post(fac.auth, body(roomB, { start: plusHours(slot.start, -1), end: plusHours(slot.start, 1) }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: `You already have another booking during this time in Room ${roomA.name}`, conflict: { type: 'person_busy' } });
  });

  test('section timetable clash (real seeded timetable row) → 409 with conflict body', async () => {
    const { rows: [tt] } = await db.query(`
      SELECT * FROM timetable_slots
      WHERE slot_time = '10:00-11:00' AND department = 'INFORMATION TECHNOLOGY'
        AND section ~ '^[0-9]+$' AND semester ~ '^[0-9]+$' AND day_of_week IN ('Mon','Tue','Wed','Thu','Fri')
      ORDER BY id LIMIT 1`);
    expect(tt).toBeDefined();
    const rep = await createRep({ branch: 'IT', semester: Number(tt.semester), section: Number(tt.section) });
    const room = await createRoom();
    const slot = futureSlot({ hour: 10, day: tt.day_of_week, minLeadHours: 0 });

    const res = await post(rep.auth, await studentBody(room, slot));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This booking clashes with an existing timetable slot in your section timetable');
    // A section can have several rows in one hour (e.g. lab batches); the app reports one of them.
    const { rows: candidates } = await db.query(
      `SELECT subject_name, faculty_name, room_name FROM timetable_slots
       WHERE slot_time = '10:00-11:00' AND department = $1 AND semester = $2 AND section = $3 AND day_of_week = $4`,
      [tt.department, tt.semester, tt.section, tt.day_of_week],
    );
    expect(res.body.conflict).toMatchObject({ type: 'timetable', label: 'your section timetable', day: tt.day_of_week, time: '10:00-11:00' });
    expect(candidates.map((c) => [c.subject_name, c.faculty_name, c.room_name]))
      .toContainEqual([res.body.conflict.subject, res.body.conflict.faculty, res.body.conflict.room]);
  });

  test('section timetable clash with a PM slot stored in 12h format ("02:00-03:00" = 14:00 IST)', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 3, section: 2, day_of_week: 'Tue', slot_time: '02:00-03:00', subject_name: uniq('Subj ') });
    const rep = await createRep({ branch: dept, semester: 3, section: 2 });
    const room = await createRoom();
    const res = await post(rep.auth, await studentBody(room, futureSlot({ hour: 14, day: 'Tue', minLeadHours: 0 })));
    expect(res.status).toBe(409);
    expect(res.body.conflict.label).toBe('your section timetable');
    // Same section, free hour → fine
    expect((await post(rep.auth, await studentBody(room, futureSlot({ hour: 15, day: 'Tue', minLeadHours: 0 })))).status).toBe(201);
  });

  test('section derived from year when semester is null (year*2)', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 4, section: 1, day_of_week: 'Wed', slot_time: '11:00-12:00', subject_name: 'Y' });
    const rep = await createRep({ branch: dept, year: 2, section: 1 });
    const res = await post(rep.auth, await studentBody(await createRoom(), futureSlot({ hour: 11, day: 'Wed', minLeadHours: 0 })));
    expect(res.status).toBe(409);
    expect(res.body.conflict.label).toBe('your section timetable');
  });

  test('ADMIN is exempt from their own section timetable', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 5, section: 1, day_of_week: 'Thu', slot_time: '09:00-10:00', subject_name: 'A' });
    const admin = await createAdmin({ branch: dept, semester: 5, section: 1 });
    const res = await post(admin.auth, body(await createRoom(), futureSlot({ hour: 9, day: 'Thu', minLeadHours: 0 })));
    expect(res.status).toBe(201);
  });

  test('selected faculty busy (faculty_timetable_slots) → 409 faculty_busy', async () => {
    const fac = await createFaculty({ name: uniq('Prof Busy ') });
    await db.query(
      `INSERT INTO faculty_timetable_slots (faculty_name, day_of_week, slot_time, content, is_occupied)
       VALUES ($1, 'Mon', '10:00-11:00', 'Lecture', true)`, [fac.user.name.toLowerCase()]);
    const rep = await createRep();
    const room = await createRoom();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 10, day: 'Mon', minLeadHours: 0 }), { faculty_id: fac.faculty.id }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'The selected faculty member is busy during this slot.', conflict: { type: 'faculty_busy' } });

    // Unoccupied faculty slot does not block
    const fac2 = await createFaculty({ name: uniq('Prof Free ') });
    await db.query(
      `INSERT INTO faculty_timetable_slots (faculty_name, day_of_week, slot_time, content, is_occupied)
       VALUES ($1, 'Mon', '10:00-11:00', '', false)`, [fac2.user.name]);
    const ok = await post((await createRep()).auth, body(await createRoom(), futureSlot({ hour: 10, day: 'Mon', minLeadHours: 0 }), { faculty_id: fac2.faculty.id }));
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('PENDING');
  });

  test('selected faculty busy (timetable_slots.faculty_name) blocks even ADMIN requests', async () => {
    const fac = await createFaculty({ name: uniq('Prof TT ') });
    await insertTimetableSlot({ department: uniq('D '), semester: 1, section: 1, day_of_week: 'Fri', slot_time: '11:00-12:00', faculty_name: fac.user.name, subject_name: 'X' });
    const admin = await createAdmin();
    const res = await post(admin.auth, body(await createRoom(), futureSlot({ hour: 11, day: 'Fri', minLeadHours: 0 }), { faculty_id: fac.faculty.id }));
    expect(res.status).toBe(409);
    expect(res.body.conflict).toEqual({ type: 'faculty_busy' });
  });

  test('FACULTY booking during their own timetable → 409 "your timetable"', async () => {
    const fac = await createFaculty({ name: uniq('Prof Own ') });
    await insertTimetableSlot({ department: uniq('D '), semester: 1, section: 1, day_of_week: 'Tue', slot_time: '09:00-11:00', faculty_name: fac.user.name, subject_name: 'Own class', room_name: 'R1' });
    const res = await post(fac.auth, body(await createRoom(), futureSlot({ hour: 10, day: 'Tue', minLeadHours: 0 })));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This booking clashes with an existing timetable slot in your timetable');
    expect(res.body.conflict).toMatchObject({ type: 'timetable', label: 'your timetable', subject: 'Own class', day: 'Tue', time: '09:00-11:00' });
  });

  test('[BKG-01] booking a room during a class scheduled in that room (timetable_slots.room_name) → 409 room_timetable', async () => {
    const room = await createRoom();
    // A class for some *other* section is held in this room on Wed 10-11.
    await insertTimetableSlot({ department: uniq('D '), semester: 6, section: 3, day_of_week: 'Wed', slot_time: '10:00-11:00', room_name: room.name, subject_name: 'Scheduled class', faculty_name: 'Prof Room' });
    const slot = futureSlot({ hour: 10, day: 'Wed', minLeadHours: 0 });
    for (const who of [await createRep(), await createFaculty(), await createAdmin()]) {
      const res = await post(who.auth, await studentBody(room, slot));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: `Room ${room.name} has a scheduled class at this time`,
        conflict: { type: 'room_timetable', subject: 'Scheduled class', faculty: 'Prof Room', room: room.name, day: 'Wed', time: '10:00-11:00' },
      });
    }
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
    // The hour after the class is free.
    expect((await post((await createFaculty()).auth, body(room, { start: slot.end, end: plusHours(slot.end) }))).status).toBe(201);
  });

  test('[BKG-01] booking a room marked unavailable in room_availability → 409 room_blocked', async () => {
    const room = await createRoom();
    await db.query(`INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Thu', 12, false)`, [room.id]);
    const rep = await createRep();
    const slot = futureSlot({ hour: 12, day: 'Thu', minLeadHours: 0 });
    const res = await post(rep.auth, await studentBody(room, slot));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: `Room ${room.name} is not available at this time`, conflict: { type: 'room_blocked', room: room.name, day: 'Thu' } });
    // A 2-hour booking that includes the blocked hour is refused too; the hour after it is fine.
    expect((await post((await createFaculty()).auth, body(room, { start: slot.start, end: plusHours(slot.start, 2) }))).status).toBe(409);
    expect((await post((await createFaculty()).auth, body(room, { start: slot.end, end: plusHours(slot.end) }))).status).toBe(201);
  });

  test('[BKG-13] half-hour timetable overlap is detected (class 10:30-11:30 vs booking 11:00-12:00)', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 2, section: 4, day_of_week: 'Mon', slot_time: '10:30-11:30', subject_name: 'Half' });
    const rep = await createRep({ branch: dept, semester: 2, section: 4 });
    const res = await post(rep.auth, await studentBody(await createRoom(), futureSlot({ hour: 11, day: 'Mon', minLeadHours: 0 })));
    expect(res.status).toBe(409);
    expect(res.body.conflict).toMatchObject({ type: 'timetable', label: 'your section timetable', time: '10:30-11:30' });
    // 12:00-13:00 starts after the half-hour class ended.
    expect((await post(rep.auth, await studentBody(await createRoom(), futureSlot({ hour: 12, day: 'Mon', minLeadHours: 0 })))).status).toBe(201);
  });

  // BKG-09 (decided): a PENDING request does not hold the room — others may request it too, and
  // approving one request rejects the overlapping ones (see faculty-approval tests). It does hold the person.
  test('[BKG-09] a PENDING request does not block the room for other requests; approving one rejects the other', async () => {
    const room = await createRoom();
    const fac = await createFaculty();
    const slot = futureSlot({ hour: 15 });
    const first = await post((await createRep()).auth, body(room, slot, { faculty_id: fac.faculty.id }));
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('PENDING');
    const second = await post((await createRep()).auth, await studentBody(room, slot));
    expect(second.status).toBe(201);
    expect(second.body.status).toBe('PENDING');

    const ok = await request(app).patch(`/api/faculty/${first.body.id}/approve`).set('Authorization', fac.auth);
    expect(ok.status).toBe(200);
    expect((await getBooking(second.body.id)).status).toBe('REJECTED');
    // Now the room is taken.
    const third = await post((await createRep()).auth, await studentBody(room, slot));
    expect(third.status).toBe(409);
    expect(third.body.conflict).toEqual({ type: 'room_booked' });
  });

  test('[BKG-09] a user with a PENDING request cannot create an overlapping booking elsewhere', async () => {
    const rep = await createRep();
    const fac = await createFaculty();
    const slot = futureSlot({ hour: 16 });
    const roomA = await createRoom();
    expect((await post(rep.auth, body(roomA, slot, { faculty_id: fac.faculty.id }))).status).toBe(201);
    const res = await post(rep.auth, await studentBody(await createRoom(), { start: plusHours(slot.start, -1), end: slot.end }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: `You already have a pending request during this time in Room ${roomA.name}`, conflict: { type: 'person_busy' } });
  });
});

describe('POST /api/bookings — end_time validation (BKG-08)', () => {
  const noRows = async (room) => (await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows.length === 0;

  test('[BKG-08] end_time before start_time → 400 (was 500), no row', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const slot = futureSlot({ hour: 10 });
    const res = await post(rep.auth, await studentBody(room, { start: slot.start, end: plusHours(slot.start, -1) }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'end_time must be after start_time' });
    expect(await noRows(room)).toBe(true);
  });

  test('[BKG-08] zero-length booking (end == start) → 400', async () => {
    const rep = await createRep();
    const slot = futureSlot({ hour: 11 });
    const res = await post(rep.auth, await studentBody(await createRoom(), { start: slot.start, end: slot.start }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'end_time must be after start_time' });
  });

  test('[BKG-08] 12-hour booking → 400 for students and staff alike', async () => {
    const slot = futureSlot({ hour: 8 });
    for (const who of [await createRep(), await createFaculty(), await createAdmin()]) {
      const res = await post(who.auth, await studentBody(await createRoom(), { start: slot.start, end: plusHours(slot.start, 12) }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Bookings last between 1 and 4 hours' });
    }
  });

  test('[BKG-08] off-grid times (10:15–10:45 IST) → 400', async () => {
    const rep = await createRep();
    const { dateKey } = futureSlot({ hour: 10 });
    const room = await createRoom();
    const res = await post(rep.auth, await studentBody(room, { start: ist(dateKey, 10, 15), end: ist(dateKey, 10, 45) }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bookings start and end on the hour' });
    expect(await noRows(room)).toBe(true);
  });
});

describe('POST /api/bookings — time grid rules (on the hour, 1–4 h, 08:00–20:00 IST, same day)', () => {
  const ON_THE_HOUR = { error: 'Bookings start and end on the hour' };
  const LENGTH = { error: 'Bookings last between 1 and 4 hours' };
  const HOURS = { error: 'Rooms can be booked between 08:00 and 20:00' };
  const at = (dateKey, h1, h2, m1 = 0, m2 = 0) => ({ start: ist(dateKey, h1, m1), end: ist(dateKey, h2, m2) });
  // A fresh faculty member each time: no weekend rule, no approval, no clash with the other cases.
  let dateKey;
  beforeAll(() => { ({ dateKey } = futureSlot({ hour: 8, minLeadHours: 0, skip: 1 })); });
  const send = async (slot) => post((await createFaculty()).auth, body(await createRoom(), slot));

  test.each([
    ['start at :30 IST', [10, 11, 30, 30], ON_THE_HOUR],
    ['end at :30 IST', [10, 11, 0, 30], ON_THE_HOUR],
    ['on the UTC hour (= :30 IST)', null, ON_THE_HOUR],
    ['30 minutes', [10, 10, 0, 30], ON_THE_HOUR],
    ['5 hours', [9, 14], LENGTH],
    ['07:00–08:00 (before opening)', [7, 8], HOURS],
    ['19:00–21:00 (after closing)', [19, 21], HOURS],
  ])('%s → 400', async (_n, hours, expected) => {
    const slot = hours ? at(dateKey, ...hours) : (() => {
      const s = new Date(ist(dateKey, 10)); s.setUTCMinutes(0); return { start: s.toISOString(), end: plusHours(s.toISOString()) };
    })();
    const res = await send(slot);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(expected);
  });

  test('a start with seconds → 400', async () => {
    const start = new Date(new Date(ist(dateKey, 10)).getTime() + 1000).toISOString();
    const res = await send({ start, end: ist(dateKey, 11) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(ON_THE_HOUR);
  });

  test('20:00–24:00 crosses midnight → 400 same-day rule', async () => {
    const res = await send({ start: ist(dateKey, 20), end: plusHours(ist(dateKey, 20), 4) });
    expect(res.status).toBe(400);
    // 20:00 start is also past closing, but the same-day rule is checked first.
    expect(res.body).toEqual({ error: 'A booking must start and end on the same day' });
  });

  test.each([
    ['1 hour at opening (08:00–09:00)', [8, 9]],
    ['4 hours (08:00–12:00)', [8, 12]],
    ['last hour (19:00–20:00)', [19, 20]],
    ['4 hours up to closing (16:00–20:00)', [16, 20]],
  ])('%s → 201', async (_n, hours) => {
    const res = await send(at(dateKey, ...hours));
    expect(res.status).toBe(201);
    expect(new Date(res.body.start_time).toISOString()).toBe(ist(dateKey, hours[0]));
    expect(new Date(res.body.end_time).toISOString()).toBe(ist(dateKey, hours[1]));
  });
});

describe('POST /api/bookings — room timetable releases', () => {
  test('a dated release of the class lets the room be booked on that date only', async () => {
    const room = await createRoom();
    await insertTimetableSlot({ department: uniq('D '), semester: 4, section: 2, day_of_week: 'Tue', slot_time: '11:00-12:00', room_name: room.name, subject_name: 'Released class' });
    const slot = futureSlot({ hour: 11, day: 'Tue', minLeadHours: 0 });
    const fac = await createFaculty();
    expect((await post(fac.auth, body(room, slot))).status).toBe(409);

    // An inactive (withdrawn) release, or one for another date / another room, changes nothing.
    await insertRelease({ room_id: room.id, release_date: slot.dateKey, start_hour: 11, is_active: false });
    await insertRelease({ room_id: room.id, release_date: '2030-01-01', start_hour: 11 });
    await insertRelease({ room_id: (await createRoom()).id, release_date: slot.dateKey, start_hour: 11 });
    expect((await post(fac.auth, body(room, slot))).status).toBe(409);

    await insertRelease({ room_id: room.id, release_date: slot.dateKey, start_hour: 11 });
    const res = await post(fac.auth, body(room, slot));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  test('a release also overrides a weekly room_availability block for that date', async () => {
    const room = await createRoom();
    await db.query(`INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Wed', 14, false)`, [room.id]);
    const slot = futureSlot({ hour: 14, day: 'Wed', minLeadHours: 0 });
    const fac = await createFaculty();
    expect((await post(fac.auth, body(room, slot))).status).toBe(409);
    await insertRelease({ room_id: room.id, release_date: slot.dateKey, start_hour: 14 });
    expect((await post(fac.auth, body(room, slot))).status).toBe(201);
  });

  test('an occupied staff timetable slot held in the room (faculty_timetable_slots.room_id) blocks it', async () => {
    const room = await createRoom();
    await db.query(
      `INSERT INTO faculty_timetable_slots (faculty_name, day_of_week, slot_time, content, is_occupied, room_id)
       VALUES ($1, 'Thu', '15:00-16:00', 'Staff lab', true, $2)`, [uniq('Prof Lab '), room.id]);
    const slot = futureSlot({ hour: 15, day: 'Thu', minLeadHours: 0 });
    const res = await post((await createFaculty()).auth, body(room, slot));
    expect(res.status).toBe(409);
    expect(res.body.conflict).toMatchObject({ type: 'room_timetable', subject: 'Staff lab', room: room.name });
  });

  test('a 2-hour booking over a released class and a second, unreleased class is still refused', async () => {
    const room = await createRoom();
    for (const t of ['10:00-11:00', '11:00-12:00']) {
      await insertTimetableSlot({ department: uniq('D '), semester: 2, section: 2, day_of_week: 'Fri', slot_time: t, room_name: room.name, subject_name: `Class ${t}` });
    }
    const slot = futureSlot({ hour: 10, day: 'Fri', minLeadHours: 0 });
    await insertRelease({ room_id: room.id, release_date: slot.dateKey, start_hour: 10, end_hour: 11 });
    const fac = await createFaculty();
    expect((await post(fac.auth, body(room, { start: slot.start, end: plusHours(slot.start, 2) }))).status).toBe(409);
    expect((await post(fac.auth, body(room, slot))).status).toBe(201); // the released hour alone is fine
  });

  test.failing('[NEW-P4-1] a 2-hour booking over a released 1-hour class plus a free hour is allowed', async () => {
    // Class 10-11 is released for the date and 11-12 has no class at all. bookingRules.isReleased
    // demands a single release covering the whole booking (start_hour <= 10 AND end_hour >= 12), so
    // the booking is refused 409 room_timetable although nothing is scheduled in the room then.
    const room = await createRoom();
    await insertTimetableSlot({ department: uniq('D '), semester: 2, section: 3, day_of_week: 'Fri', slot_time: '10:00-11:00', room_name: room.name, subject_name: 'Cancelled today' });
    const slot = futureSlot({ hour: 10, day: 'Fri', minLeadHours: 0 });
    await insertRelease({ room_id: room.id, release_date: slot.dateKey, start_hour: 10, end_hour: 11 });
    const res = await post((await createFaculty()).auth, body(room, { start: slot.start, end: plusHours(slot.start, 2) }));
    expect(res.status).toBe(201);
  });
});

describe('POST /api/bookings — faculty_id validation (BKG-10)', () => {
  // faculty_id is a faculty-directory id (faculties.id) and must name an ACTIVE entry.
  const NOT_FOUND = { error: 'Selected faculty member was not found' };
  const noBookingFor = async (rep) => (await db.query('SELECT 1 FROM bookings WHERE created_by = $1', [rep.user.id])).rows.length === 0;

  test('[BKG-10] faculty_id that is not a faculty-directory entry (another user\'s id) → 400', async () => {
    const rep = await createRep();
    const notFaculty = await createRep();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 9 }), { faculty_id: notFaculty.user.id }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
    expect(await noBookingFor(rep)).toBe(true);
  });

  test('[BKG-10] the requester naming themselves as approving faculty → 400', async () => {
    const rep = await createRep();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 10 }), { faculty_id: rep.user.id }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('[BKG-10] non-existent faculty_id → 400 (not an FK violation 500)', async () => {
    const rep = await createRep();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 11 }), { faculty_id: 2147483000 }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('a FACULTY account\'s user id is not accepted as faculty_id (directory id required)', async () => {
    const rep = await createRep();
    const fac = await createFaculty();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 12 }), { faculty_id: fac.user.id }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('a directory entry without a sign-in account is a valid faculty_id → PENDING', async () => {
    const rep = await createRep();
    const entry = await createFacultyEntry();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 13 }), { faculty_id: entry.id }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', faculty_id: entry.id });
  });

  test('a soft-deleted (inactive) faculty entry is rejected as faculty_id → 400', async () => {
    const rep = await createRep();
    const fac = await createFaculty();
    await db.query('UPDATE faculties SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1', [fac.faculty.id]);
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 14 }), { faculty_id: fac.faculty.id }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
    expect(await noBookingFor(rep)).toBe(true);
  });
});

describe('POST /api/bookings — soft-deleted room', () => {
  test('a soft-deleted room cannot be booked → 404, nothing inserted', async () => {
    const rep = await createRep();
    const admin = await createAdmin();
    const room = await createRoom();
    await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth).expect(200);
    const res = await post(rep.auth, body(room, futureSlot({ hour: 15 })));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Room not found' });
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });
});

describe('POST /api/bookings — per-user cap (BKG-11)', () => {
  test.failing('[BKG-11] a single student cannot hold an unbounded number of future bookings', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const facultyId = await approverId();
    const statuses = [];
    for (let skip = 0; skip < 3; skip++) {
      for (let hour = 9; hour <= 16; hour++) {
        const res = await post(rep.auth, body(room, futureSlot({ hour, skip }), { faculty_id: facultyId }));
        statuses.push(res.status);
      }
    }
    // 24 one-hour requests in a single week by one student: at least one should be refused.
    // (Every request names a faculty member, so a 400 here can only come from a cap.)
    expect(statuses.some((s) => s >= 400 && s < 500)).toBe(true);
  });
});

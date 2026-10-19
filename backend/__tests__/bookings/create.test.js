import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createUser, createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking,
  futureSlot, pastSlot, tokenFor, closeDb,
} from '../../test/helpers/factories.js';
import {
  uniq, plusHours, ist, pastWeekdaySlot, farWeekdaySlot, getBooking, auditRows, insertTimetableSlot, waitFor,
} from '../../test/helpers/bookings.js';

afterAll(closeDb);

const post = (auth, body) => {
  const r = request(app).post('/api/bookings');
  if (auth) r.set('Authorization', auth);
  return r.send(body);
};
const body = (room, slot, extra = {}) => ({
  room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Club meeting', ...extra,
});

describe('POST /api/bookings — success', () => {
  test('STUDENT_REP books a free room: 201, ACTIVE row persisted, audit CREATE_BOOKING', async () => {
    const rep = await createRep();
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
    expect(audit[0].details).toMatchObject({ room_id: room.id, purpose: 'Club meeting' });

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
    const res = await post(rep.auth, body(room, slot, { faculty_id: fac.user.id }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', faculty_id: fac.user.id, created_by: rep.user.id });
    expect((await getBooking(res.body.id)).status).toBe('PENDING');
    expect(await auditRows(res.body.id, 'REQUEST_BOOKING')).toHaveLength(1);
    expect(await auditRows(res.body.id, 'CREATE_BOOKING')).toHaveLength(0);
  });

  // QUESTION: faculty approval is opt-in — a student that omits faculty_id gets an ACTIVE booking
  // immediately (BKG-10). Documenting current behaviour; product must decide whether approval is mandatory.
  test('omitting faculty_id yields an ACTIVE booking without faculty approval (current behaviour)', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 12 })));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  test('FACULTY and ADMIN can book', async () => {
    const fac = await createFaculty();
    const admin = await createAdmin();
    const room = await createRoom();
    const r1 = await post(fac.auth, body(room, futureSlot({ hour: 13 })));
    const r2 = await post(admin.auth, body(room, futureSlot({ hour: 14 })));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.created_by).toBe(fac.user.id);
    expect(r2.body.created_by).toBe(admin.user.id);
  });

  test('a booking that started less than an hour ago is still accepted (current-slot grace)', async () => {
    const admin = await createAdmin(); // admin: avoids weekend rule on whatever day today is
    const room = await createRoom();
    const start = new Date(Date.now() - 30 * 60_000).toISOString();
    const res = await post(admin.auth, { room_id: room.id, start_time: start, end_time: plusHours(start), purpose: 'Now' });
    expect(res.status).toBe(201);
  });

  test('purpose is trimmed', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 15 }), { purpose: '   Spaced   ' }));
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
  let rep; let room; let slot;
  beforeAll(async () => {
    rep = await createRep();
    room = await createRoom();
    slot = futureSlot({ hour: 16 });
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
    const b = body(room, slot);
    mutate(b);
    const res = await post(rep.auth, b);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(msg);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  test('purpose of exactly 100 chars is accepted', async () => {
    const res = await post(rep.auth, body(room, slot, { purpose: 'p'.repeat(100) }));
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

  test('weekend rule is evaluated in IST: Mon 01:00 IST (Sun 19:30 UTC) is a weekday for students', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const mon = futureSlot({ hour: 1, day: 'Mon', minLeadHours: 0 });
    const res = await post(rep.auth, body(room, mon));
    // Either accepted or rejected for the 7-day window — never as a weekend booking.
    expect(res.body.error).not.toBe('Students are not allowed to book rooms on weekends');
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
      { start: plusHours(slot.start, -0.5), end: plusHours(slot.start, 0.5) }]) {
      const res = await post(rep.auth, body(room, s));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Room is already booked for this time period (or pending approval)' });
    }
    const { rows } = await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id]);
    expect(rows).toHaveLength(1);
  });

  test('adjacent slots (end == next start) do not conflict', async () => {
    const room = await createRoom();
    const rep = await createRep();
    const slot = futureSlot({ hour: 10 });
    expect((await post(rep.auth, body(room, slot))).status).toBe(201);
    const next = { start: slot.end, end: plusHours(slot.end) };
    expect((await post((await createRep()).auth, body(room, next))).status).toBe(201);
  });

  test('CANCELLED / REJECTED bookings do not block the room', async () => {
    const room = await createRoom();
    const other = await createRep();
    const slot = futureSlot({ hour: 13 });
    await insertBooking({ room_id: room.id, created_by: other.user.id, start_time: slot.start, status: 'CANCELLED' });
    await insertBooking({ room_id: room.id, created_by: other.user.id, start_time: slot.start, status: 'REJECTED' });
    const res = await post((await createRep()).auth, body(room, slot));
    expect(res.status).toBe(201);
  });

  test('user double-booking in another room → 409 naming the other room', async () => {
    const rep = await createRep();
    const roomA = await createRoom();
    const roomB = await createRoom();
    const slot = futureSlot({ hour: 14 });
    expect((await post(rep.auth, body(roomA, slot))).status).toBe(201);
    const res = await post(rep.auth, body(roomB, { start: plusHours(slot.start, 0.5), end: plusHours(slot.start, 1.5) }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: `You already have another booking during this time in Room ${roomA.name}` });
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

    const res = await post(rep.auth, body(room, slot));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('This booking clashes with an existing timetable slot in your section timetable');
    expect(res.body.conflict).toEqual({
      type: 'timetable', label: 'your section timetable', subject: tt.subject_name, faculty: tt.faculty_name,
      room: tt.room_name, day: tt.day_of_week, time: '10:00-11:00',
    });
  });

  test('section timetable clash with a PM slot stored in 12h format ("02:00-03:00" = 14:00 IST)', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 3, section: 2, day_of_week: 'Tue', slot_time: '02:00-03:00', subject_name: uniq('Subj ') });
    const rep = await createRep({ branch: dept, semester: 3, section: 2 });
    const room = await createRoom();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 14, day: 'Tue', minLeadHours: 0 })));
    expect(res.status).toBe(409);
    expect(res.body.conflict.label).toBe('your section timetable');
    // Same section, free hour → fine
    expect((await post(rep.auth, body(room, futureSlot({ hour: 15, day: 'Tue', minLeadHours: 0 })))).status).toBe(201);
  });

  test('section derived from year when semester is null (year*2)', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 4, section: 1, day_of_week: 'Wed', slot_time: '11:00-12:00', subject_name: 'Y' });
    const rep = await createRep({ branch: dept, year: 2, section: 1 });
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 11, day: 'Wed', minLeadHours: 0 })));
    expect(res.status).toBe(409);
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
    const res = await post(rep.auth, body(room, futureSlot({ hour: 10, day: 'Mon', minLeadHours: 0 }), { faculty_id: fac.user.id }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'The selected faculty member is busy during this slot.', conflict: { type: 'faculty_busy' } });

    // Unoccupied faculty slot does not block
    const fac2 = await createFaculty({ name: uniq('Prof Free ') });
    await db.query(
      `INSERT INTO faculty_timetable_slots (faculty_name, day_of_week, slot_time, content, is_occupied)
       VALUES ($1, 'Mon', '10:00-11:00', '', false)`, [fac2.user.name]);
    const ok = await post((await createRep()).auth, body(await createRoom(), futureSlot({ hour: 10, day: 'Mon', minLeadHours: 0 }), { faculty_id: fac2.user.id }));
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('PENDING');
  });

  test('selected faculty busy (timetable_slots.faculty_name) blocks even ADMIN requests', async () => {
    const fac = await createFaculty({ name: uniq('Prof TT ') });
    await insertTimetableSlot({ department: uniq('D '), semester: 1, section: 1, day_of_week: 'Fri', slot_time: '11:00-12:00', faculty_name: fac.user.name, subject_name: 'X' });
    const admin = await createAdmin();
    const res = await post(admin.auth, body(await createRoom(), futureSlot({ hour: 11, day: 'Fri', minLeadHours: 0 }), { faculty_id: fac.user.id }));
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

  test.failing('[BKG-01] booking a room during a class scheduled in that room (timetable_slots.room_name) → 409', async () => {
    const room = await createRoom();
    // A class for some *other* section is held in this room on Wed 10-11.
    await insertTimetableSlot({ department: uniq('D '), semester: 6, section: 3, day_of_week: 'Wed', slot_time: '10:00-11:00', room_name: room.name, subject_name: 'Scheduled class' });
    const rep = await createRep();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 10, day: 'Wed', minLeadHours: 0 })));
    expect(res.status).toBe(409);
  });

  test.failing('[BKG-01] booking a room marked unavailable in room_availability → 409', async () => {
    const room = await createRoom();
    await db.query(`INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Thu', 12, false)`, [room.id]);
    const rep = await createRep();
    const res = await post(rep.auth, body(room, futureSlot({ hour: 12, day: 'Thu', minLeadHours: 0 })));
    expect(res.status).toBe(409);
  });

  test.failing('[BKG-13] half-hour timetable overlap is detected (class 10:30-11:30 vs booking 11:00-12:00)', async () => {
    const dept = uniq('DEPT ');
    await insertTimetableSlot({ department: dept, semester: 2, section: 4, day_of_week: 'Mon', slot_time: '10:30-11:30', subject_name: 'Half' });
    const rep = await createRep({ branch: dept, semester: 2, section: 4 });
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 11, day: 'Mon', minLeadHours: 0 })));
    expect(res.status).toBe(409);
  });

  test.failing('[BKG-09] a room with a PENDING request is not bookable by someone else ("or pending approval")', async () => {
    const room = await createRoom();
    const fac = await createFaculty();
    const slot = futureSlot({ hour: 15 });
    const first = await post((await createRep()).auth, body(room, slot, { faculty_id: fac.user.id }));
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('PENDING');
    const second = await post((await createRep()).auth, body(room, slot));
    expect(second.status).toBe(409);
  });

  test.failing('[BKG-09] a user with a PENDING request cannot create an overlapping booking elsewhere', async () => {
    const rep = await createRep();
    const fac = await createFaculty();
    const slot = futureSlot({ hour: 16 });
    expect((await post(rep.auth, body(await createRoom(), slot, { faculty_id: fac.user.id }))).status).toBe(201);
    const res = await post(rep.auth, body(await createRoom(), slot));
    expect(res.status).toBe(409);
  });
});

describe('POST /api/bookings — end_time validation (BKG-08)', () => {
  test.failing('[BKG-08] end_time before start_time → 400 (currently 500)', async () => {
    const rep = await createRep();
    const slot = futureSlot({ hour: 10 });
    const res = await post(rep.auth, body(await createRoom(), { start: slot.start, end: plusHours(slot.start, -1) }));
    expect(res.status).toBe(400);
  });

  test('end_time before start_time currently → 500 and no row (documents BKG-08 failure mode)', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const slot = futureSlot({ hour: 10 });
    const res = await post(rep.auth, body(room, { start: slot.start, end: plusHours(slot.start, -1) }));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Database error' });
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test.failing('[BKG-08] zero-length booking (end == start) → 400', async () => {
    const rep = await createRep();
    const slot = futureSlot({ hour: 11 });
    const res = await post(rep.auth, body(await createRoom(), { start: slot.start, end: slot.start }));
    expect(res.status).toBe(400);
  });

  test.failing('[BKG-08] 12-hour booking by a student → 400', async () => {
    const rep = await createRep();
    const slot = futureSlot({ hour: 8 });
    const res = await post(rep.auth, body(await createRoom(), { start: slot.start, end: plusHours(slot.start, 12) }));
    expect(res.status).toBe(400);
  });

  test.failing('[BKG-08] off-grid times (10:15–10:45 IST) → 400', async () => {
    const rep = await createRep();
    const { dateKey } = futureSlot({ hour: 10 });
    const res = await post(rep.auth, body(await createRoom(), { start: ist(dateKey, 10, 15), end: ist(dateKey, 10, 45) }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bookings — faculty_id validation (BKG-10)', () => {
  test.failing('[BKG-10] faculty_id that is not a FACULTY user → 400', async () => {
    const rep = await createRep();
    const notFaculty = await createRep();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 9 }), { faculty_id: notFaculty.user.id }));
    expect(res.status).toBe(400);
  });

  test.failing('[BKG-10] the requester naming themselves as approving faculty → 400', async () => {
    const rep = await createRep();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 10 }), { faculty_id: rep.user.id }));
    expect(res.status).toBe(400);
  });

  test.failing('[BKG-10] non-existent faculty_id → 400 (currently FK violation → 500)', async () => {
    const rep = await createRep();
    const res = await post(rep.auth, body(await createRoom(), futureSlot({ hour: 11 }), { faculty_id: 2147483000 }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bookings — per-user cap (BKG-11)', () => {
  test.failing('[BKG-11] a single student cannot hold an unbounded number of future bookings', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const statuses = [];
    for (let skip = 0; skip < 3; skip++) {
      for (let hour = 9; hour <= 16; hour++) {
        const res = await post(rep.auth, body(room, futureSlot({ hour, skip })));
        statuses.push(res.status);
      }
    }
    // 24 one-hour bookings in a single week by one student: at least one should be refused.
    expect(statuses.some((s) => s >= 400 && s < 500)).toBe(true);
  });
});

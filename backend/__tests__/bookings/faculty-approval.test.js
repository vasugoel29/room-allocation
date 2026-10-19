import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createUser, createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, futureSlot, pastSlot, closeDb,
} from '../../test/helpers/factories.js';
import { getIstParts } from '../../src/utils/timezone.js';
import { uniq, plusHours, getBooking, auditRows, insertTimetableSlot } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const call = (method, auth, path) => {
  const r = request(app)[method](path);
  if (auth) r.set('Authorization', auth);
  return r.send();
};
const approve = (auth, id) => call('patch', auth, `/api/faculty/${id}/approve`);
const reject = (auth, id) => call('patch', auth, `/api/faculty/${id}/reject`);

async function pending({ fac, student, room, slot = futureSlot({ hour: 10 }), status = 'PENDING' } = {}) {
  fac = fac || (await createFaculty());
  student = student || (await createRep());
  room = room || (await createRoom());
  const booking = await insertBooking({
    room_id: room.id, created_by: student.user.id, start_time: slot.start, end_time: slot.end, status, faculty_id: fac.faculty.id,
  });
  return { fac, student, room, slot, booking };
}

describe('GET /api/faculty/pending', () => {
  test('faculty sees only their own PENDING requests with room/user details', async () => {
    const fac = await createFaculty();
    const mine = await pending({ fac });
    await pending({ fac, status: 'ACTIVE', slot: futureSlot({ hour: 11 }) });
    await pending({ fac, status: 'REJECTED', slot: futureSlot({ hour: 12 }) });
    await pending({ slot: futureSlot({ hour: 13 }) }); // someone else's faculty

    const res = await call('get', fac.auth, '/api/faculty/pending');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: mine.booking.id, status: 'PENDING', room_name: mine.room.name,
      user_name: mine.student.user.name, user_email: mine.student.user.email,
    });
  });

  test('STUDENT_REP / VIEWER → 403; no token → 401', async () => {
    expect((await call('get', (await createRep()).auth, '/api/faculty/pending')).status).toBe(403);
    expect((await call('get', (await createViewer()).auth, '/api/faculty/pending')).status).toBe(403);
    expect((await call('get', null, '/api/faculty/pending')).status).toBe(401);
  });

  test('ADMIN passes the role gate and sees requests assigned to the admin id (empty)', async () => {
    const res = await call('get', (await createAdmin()).auth, '/api/faculty/pending');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PATCH /api/faculty/:id/approve', () => {
  test('end-to-end: student requests via POST, assigned faculty approves → ACTIVE, audit row', async () => {
    const fac = await createFaculty();
    const student = await createRep();
    const room = await createRoom();
    const slot = futureSlot({ hour: 10 });
    const created = await request(app).post('/api/bookings').set('Authorization', student.auth)
      .send({ room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Seminar', faculty_id: fac.faculty.id });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('PENDING');

    const res = await approve(fac.auth, created.body.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Booking approved');
    expect(res.body.booking).toMatchObject({ id: created.body.id, status: 'ACTIVE', faculty_id: fac.faculty.id });
    expect((await getBooking(created.body.id)).status).toBe('ACTIVE');

    const audit = await auditRows(created.body.id, 'APPROVE_BOOKING');
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(fac.user.id);
    expect(audit[0].details).toEqual({ approved_by: 'FACULTY' });
  });

  test('approval rejects other overlapping PENDING requests for the same room only', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const slot = futureSlot({ hour: 11 });
    const a = await pending({ fac, room, slot });
    const overlapping = await pending({ room, slot: { start: plusHours(slot.start, 0.5), end: plusHours(slot.start, 1.5) } });
    const adjacent = await pending({ room, slot: { start: slot.end, end: plusHours(slot.end) } });
    const otherRoom = await pending({ slot });

    expect((await approve(fac.auth, a.booking.id)).status).toBe(200);
    expect((await getBooking(a.booking.id)).status).toBe('ACTIVE');
    expect((await getBooking(overlapping.booking.id)).status).toBe('REJECTED');
    expect((await getBooking(adjacent.booking.id)).status).toBe('PENDING');
    expect((await getBooking(otherRoom.booking.id)).status).toBe('PENDING');
  });

  test('another faculty member → 403, booking stays PENDING', async () => {
    const { booking } = await pending();
    const res = await approve((await createFaculty()).auth, booking.id);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Not authorized' });
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  test('approval is keyed on the directory link: a FACULTY account whose user id equals booking.faculty_id is not the assignee', async () => {
    const { booking, fac } = await pending();
    // A FACULTY account without any directory entry → no faculty_id → 403, and its pending list is empty.
    const unlinked = await createUser({ role: 'FACULTY' });
    expect((await approve(unlinked.auth, booking.id)).status).toBe(403);
    expect((await call('get', unlinked.auth, '/api/faculty/pending')).body).toEqual([]);
    // The assignee is identified by faculties.id (≥ 500000 in tests), never by users.id.
    expect(booking.faculty_id).toBe(fac.faculty.id);
    expect(booking.faculty_id).not.toBe(fac.user.id);
  });

  test('once the faculty directory entry is soft-deleted, its linked account can no longer approve or list the request', async () => {
    const { booking, fac } = await pending();
    await db.query('UPDATE faculties SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1', [fac.faculty.id]);
    expect((await call('get', fac.auth, '/api/faculty/pending')).body).toEqual([]);
    const res = await approve(fac.auth, booking.id);
    expect(res.status).toBe(403);
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  test('STUDENT_REP (even the requester) → 403 Forbidden', async () => {
    const { booking, student } = await pending();
    const res = await approve(student.auth, booking.id);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  test('not pending → 400; not found → 404; no token → 401', async () => {
    const { fac, booking } = await pending({ status: 'ACTIVE' });
    let res = await approve(fac.auth, booking.id);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Booking is not pending' });

    res = await approve(fac.auth, 2147483000);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Booking not found' });

    expect((await approve(null, booking.id)).status).toBe(401);
  });

  test('room taken by an ACTIVE booking meanwhile → 409, stays PENDING', async () => {
    const { fac, room, slot, booking } = await pending({ slot: futureSlot({ hour: 14 }) });
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
    const res = await approve(fac.auth, booking.id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'Room is already booked for this time period' });
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  describe('approval re-validates the slot', () => {
    test('a class added to the room after the request → 409, stays PENDING', async () => {
      const room = await createRoom();
      const slot = futureSlot({ hour: 11, day: 'Wed', minLeadHours: 0 });
      const { fac, booking } = await pending({ room, slot });
      await insertTimetableSlot({ department: uniq('D '), semester: 7, section: 1, day_of_week: 'Wed', slot_time: '11:00-12:00', room_name: room.name, subject_name: 'New class' });
      const res = await approve(fac.auth, booking.id);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: `Room ${room.name} has a scheduled class at this time` });
      expect((await getBooking(booking.id)).status).toBe('PENDING');
    });

    test('a weekly room block added after the request → 409', async () => {
      const room = await createRoom();
      const slot = futureSlot({ hour: 13, day: 'Thu', minLeadHours: 0 });
      const { fac, booking } = await pending({ room, slot });
      await db.query(`INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Thu', 13, false)`, [room.id]);
      expect((await approve(fac.auth, booking.id)).status).toBe(409);
      expect((await getBooking(booking.id)).status).toBe('PENDING');
    });

    test('the room was deactivated after the request → 409', async () => {
      const { fac, room, booking } = await pending({ slot: futureSlot({ hour: 12 }) });
      await db.query('UPDATE rooms SET is_active = FALSE WHERE id = $1', [room.id]);
      const res = await approve(fac.auth, booking.id);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'Room is no longer available' });
      expect((await getBooking(booking.id)).status).toBe('PENDING');
    });

    test('a request whose start time has passed → 400', async () => {
      const slot = pastSlot(0); // the current IST hour: started up to 59 minutes ago
      const { fac, booking } = await pending({ slot });
      const res = await approve(fac.auth, booking.id);
      expect(res.status).toBe(400);
      const h = getIstParts(slot.start).hour; // outside opening hours that rule is reported first
      expect(res.body.error).toBe(h === 23 ? 'A booking must start and end on the same day'
      : h >= 8 && h < 20 ? 'This request is for a time that has already started' : 'Rooms can be booked between 08:00 and 20:00');
      expect((await getBooking(booking.id)).status).toBe('PENDING');
    });

    test('the faculty member has since booked that slot themselves → 409 faculty_busy', async () => {
      const slot = futureSlot({ hour: 15 });
      const { fac, booking } = await pending({ slot });
      const own = await request(app).post('/api/bookings').set('Authorization', fac.auth)
        .send({ room_id: (await createRoom()).id, start_time: slot.start, end_time: slot.end, purpose: 'Own meeting' });
      expect(own.status).toBe(201);
      const res = await approve(fac.auth, booking.id);
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: 'The selected faculty member is busy during this slot.' });
      expect((await getBooking(booking.id)).status).toBe('PENDING');
    });

    test('the faculty member already approved another overlapping request → second approval 409', async () => {
      const fac = await createFaculty();
      const slot = futureSlot({ hour: 16 });
      const a = await pending({ fac, slot });
      const b = await pending({ fac, slot: { start: slot.start, end: plusHours(slot.start, 2) } });
      expect((await approve(fac.auth, a.booking.id)).status).toBe(200);
      expect((await approve(fac.auth, b.booking.id)).status).toBe(409);
      expect((await getBooking(b.booking.id)).status).toBe('PENDING');
    });

    test('[NEW-P4-4] a 409 from approval carries the conflict body like create/reschedule do', async () => {
      // facultyController.approveBooking returns only { error }; the create, reschedule and quick-book
      // controllers forward result.conflict, so the faculty UI cannot show what clashed.
      const { fac, room, slot, booking } = await pending({ slot: futureSlot({ hour: 17 }) });
      await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
      const res = await approve(fac.auth, booking.id);
      expect(res.status).toBe(409);
      expect(res.body.conflict).toEqual({ type: 'room_booked' });
    });

    test('[NEW-P4-5] concurrent approval of two overlapping requests for one room: one 200, the other 409 (never 500)', async () => {
      // approveBooking runs in a plain runInTransaction: a lost race surfaces as the exclusion-constraint
      // error (23P01) or a deadlock with rejectConflicts (40P01), and the controller turns both into 500.
      const statuses = [];
      for (let round = 0; round < 4; round++) {
        const room = await createRoom();
        const slot = futureSlot({ hour: 8 + round * 3, skip: 1 });
        const a = await pending({ room, slot });
        const b = await pending({ room, slot: { start: slot.start, end: plusHours(slot.start, 2) } });
        const res = await Promise.all([approve(a.fac.auth, a.booking.id), approve(b.fac.auth, b.booking.id)]);
        statuses.push(...res.map((r) => r.status));
        const { rows } = await db.query(`SELECT 1 FROM bookings WHERE room_id = $1 AND status = 'ACTIVE'`, [room.id]);
        expect(rows).toHaveLength(1);
      }
      expect(statuses.filter((s) => s >= 500)).toEqual([]);
    });
  });

  test.failing('[NEW-bookings-5] non-numeric booking id → 400/404, not 500', async () => {
    const res = await approve((await createFaculty()).auth, 'abc');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('[BKG-03] ADMIN approving a PENDING booking → 200 and ACTIVE; audit attributes the admin', async () => {
    const admin = await createAdmin();
    const { booking } = await pending({ slot: futureSlot({ hour: 15 }) });
    const res = await approve(admin.auth, booking.id);
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ id: booking.id, status: 'ACTIVE' });
    expect((await getBooking(booking.id)).status).toBe('ACTIVE');
    const audit = await auditRows(booking.id, 'APPROVE_BOOKING');
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(admin.user.id);
    expect(audit[0].details).toEqual({ approved_by: 'ADMIN' });
  });

  describe('BKG-09: PENDING requests of the same user', () => {
    // A student can no longer hold two overlapping requests at all (bookings_no_person_overlap), so two
    // overlapping requests of one student can never both be approved.
    test('[BKG-09] a student cannot file overlapping PENDING requests in different rooms (second → 409)', async () => {
      const student = await createRep();
      const fac = await createFaculty();
      const slot = futureSlot({ hour: 15, skip: 1 });
      const body = (room, s = slot) => ({ room_id: room.id, start_time: s.start, end_time: s.end, purpose: 'p', faculty_id: fac.faculty.id });
      const roomA = await createRoom();
      const r1 = await request(app).post('/api/bookings').set('Authorization', student.auth).send(body(roomA));
      const r2 = await request(app).post('/api/bookings').set('Authorization', student.auth).send(body(await createRoom()));
      const r3 = await request(app).post('/api/bookings').set('Authorization', student.auth)
        .send(body(await createRoom(), { start: plusHours(slot.start, -1), end: slot.end }));
      expect([r1.status, r2.status, r3.status]).toEqual([201, 409, 409]);
      expect(r2.body).toEqual({ error: `You already have a pending request during this time in Room ${roomA.name}`, conflict: { type: 'person_busy' } });
    });

    test('[BKG-09] the database refuses a second overlapping PENDING row for the same student (same start or not)', async () => {
      const student = await createRep();
      const fac = await createFaculty();
      const slot = futureSlot({ hour: 10, skip: 1 });
      await pending({ fac, student, slot: { start: slot.start, end: plusHours(slot.start, 2) } });
      for (const s of [slot, { start: plusHours(slot.start, 1), end: plusHours(slot.start, 2) }]) {
        await expect(pending({ fac, student, slot: s })).rejects.toMatchObject({ code: '23P01', constraint: 'bookings_no_person_overlap' });
      }
    });
  });
});

describe('PATCH /api/faculty/:id/reject', () => {
  test('assigned faculty rejects → 200, status REJECTED', async () => {
    const { fac, booking } = await pending();
    const res = await reject(fac.auth, booking.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Booking rejected' });
    expect((await getBooking(booking.id)).status).toBe('REJECTED');
  });

  test('ADMIN can reject any pending request', async () => {
    const { booking } = await pending();
    expect((await reject((await createAdmin()).auth, booking.id)).status).toBe(200);
    expect((await getBooking(booking.id)).status).toBe('REJECTED');
  });

  test('other faculty → 403; student → 403; not pending → 400; not found → 404', async () => {
    const { fac, booking, student } = await pending();
    expect((await reject((await createFaculty()).auth, booking.id)).status).toBe(403);
    expect((await reject(student.auth, booking.id)).status).toBe(403);
    expect((await getBooking(booking.id)).status).toBe('PENDING');

    expect((await reject(fac.auth, booking.id)).status).toBe(200);
    const again = await reject(fac.auth, booking.id);
    expect(again.status).toBe(400);
    expect(again.body).toEqual({ error: 'Booking is not pending' });

    const nf = await reject(fac.auth, 2147483000);
    expect(nf.status).toBe(404);
  });

  test('a rejected booking cannot then be approved', async () => {
    const { fac, booking } = await pending();
    expect((await reject(fac.auth, booking.id)).status).toBe(200);
    expect((await approve(fac.auth, booking.id)).status).toBe(400);
  });

  test('[NEW-bookings-6] rejection writes a REJECT_BOOKING audit row (approval writes APPROVE_BOOKING)', async () => {
    const { fac, booking } = await pending();
    expect((await reject(fac.auth, booking.id)).status).toBe(200);
    const audit = await auditRows(booking.id, 'REJECT_BOOKING');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ user_id: fac.user.id, details: { rejected_by: 'FACULTY' } });
  });
});

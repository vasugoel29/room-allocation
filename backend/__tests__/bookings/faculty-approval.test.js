import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createUser, createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { plusHours, getBooking, auditRows } from '../../test/helpers/bookings.js';

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
    expect(res.body).toEqual({ error: 'Not authorized' });
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
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  test('not pending → 400; not found → 404; no token → 401', async () => {
    const { fac, booking } = await pending({ status: 'ACTIVE' });
    let res = await approve(fac.auth, booking.id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Booking is not pending' });

    res = await approve(fac.auth, 2147483000);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Booking not found' });

    expect((await approve(null, booking.id)).status).toBe(401);
  });

  test('room taken by an ACTIVE booking meanwhile → 409, stays PENDING', async () => {
    const { fac, room, slot, booking } = await pending({ slot: futureSlot({ hour: 14 }) });
    await insertBooking({ room_id: room.id, created_by: (await createRep()).user.id, start_time: slot.start, end_time: slot.end });
    const res = await approve(fac.auth, booking.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Room already booked' });
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  test.failing('[NEW-bookings-5] non-numeric booking id → 400/404, not 500', async () => {
    const res = await approve((await createFaculty()).auth, 'abc');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test.failing('[BKG-03] ADMIN approving a PENDING booking → 200 and ACTIVE', async () => {
    const { booking } = await pending({ slot: futureSlot({ hour: 15 }) });
    const res = await approve((await createAdmin()).auth, booking.id);
    expect(res.status).toBe(200);
    expect((await getBooking(booking.id)).status).toBe('ACTIVE');
  });

  test('ADMIN approval currently → 500 and the booking stays PENDING (documents BKG-03)', async () => {
    const { booking } = await pending({ slot: futureSlot({ hour: 16 }) });
    const res = await approve((await createAdmin()).auth, booking.id);
    expect(res.status).toBe(500);
    expect((await getBooking(booking.id)).status).toBe('PENDING');
  });

  describe('BKG-09: PENDING requests of the same user', () => {
    test.failing('[BKG-09] approving two overlapping requests (different starts) of one student → second is refused 409', async () => {
      const student = await createRep();
      const fac = await createFaculty();
      const slot = futureSlot({ hour: 10, skip: 1 });
      const a = await pending({ fac, student, slot: { start: slot.start, end: plusHours(slot.start, 2) } });
      const b = await pending({ fac, student, slot: { start: plusHours(slot.start, 1), end: plusHours(slot.start, 2) } });
      expect((await approve(fac.auth, a.booking.id)).status).toBe(200);
      const res = await approve(fac.auth, b.booking.id);
      expect(res.status).toBe(409);
      expect((await getBooking(b.booking.id)).status).not.toBe('ACTIVE');
    });

    test.failing('[BKG-09] approving two same-start requests of one student → second is 409, not 500', async () => {
      const student = await createRep();
      const fac = await createFaculty();
      const slot = futureSlot({ hour: 13, skip: 1 });
      const a = await pending({ fac, student, slot });
      const b = await pending({ fac, student, slot });
      expect((await approve(fac.auth, a.booking.id)).status).toBe(200);
      const res = await approve(fac.auth, b.booking.id);
      expect(res.status).toBe(409);
    });

    test('student can currently file overlapping PENDING requests in different rooms (documents BKG-09)', async () => {
      const student = await createRep();
      const fac = await createFaculty();
      const slot = futureSlot({ hour: 15, skip: 1 });
      const body = (room) => ({ room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'p', faculty_id: fac.faculty.id });
      const r1 = await request(app).post('/api/bookings').set('Authorization', student.auth).send(body(await createRoom()));
      const r2 = await request(app).post('/api/bookings').set('Authorization', student.auth).send(body(await createRoom()));
      expect([r1.status, r2.status]).toEqual([201, 201]);
      expect([r1.body.status, r2.body.status]).toEqual(['PENDING', 'PENDING']);
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

  test.failing('[NEW-bookings-6] rejection writes a REJECT_BOOKING audit row (approval writes APPROVE_BOOKING)', async () => {
    const { fac, booking } = await pending();
    expect((await reject(fac.auth, booking.id)).status).toBe(200);
    expect(await auditRows(booking.id, 'REJECT_BOOKING')).toHaveLength(1);
  });
});

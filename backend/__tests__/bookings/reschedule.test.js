import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import {
  uniq, plusHours, pastWeekdaySlot, farWeekdaySlot, getBooking, auditRows, historyRows, insertTimetableSlot,
} from '../../test/helpers/bookings.js';

afterAll(closeDb);

const patch = (auth, id, body) => {
  const r = request(app).patch(`/api/bookings/${id}`);
  if (auth) r.set('Authorization', auth);
  return r.send(body);
};

async function seeded({ owner, hour = 10, status = 'ACTIVE', room } = {}) {
  owner = owner || (await createRep());
  room = room || (await createRoom());
  const slot = futureSlot({ hour });
  const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, status });
  return { owner, room, booking, slot };
}

const iso = (d) => new Date(d).toISOString();

describe('PATCH /api/bookings/:id (reschedule)', () => {
  test('owner moves booking to a new time: 200, DB updated, booking_history + audit rows written', async () => {
    const { owner, room, booking, slot } = await seeded({ hour: 10 });
    const target = futureSlot({ hour: 14 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: booking.id, room_id: room.id, status: 'ACTIVE' });
    expect(iso(res.body.start_time)).toBe(target.start);
    expect(iso(res.body.end_time)).toBe(target.end);

    const row = await getBooking(booking.id);
    expect(iso(row.start_time)).toBe(target.start);

    const hist = await historyRows(booking.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ previous_room_id: room.id, modified_by: owner.user.id, change_type: 'RESCHEDULE' });
    expect(iso(hist[0].previous_start_time)).toBe(slot.start);
    expect(iso(hist[0].previous_end_time)).toBe(slot.end);

    const audit = await auditRows(booking.id, 'RESCHEDULE_BOOKING');
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(owner.user.id);
    expect(audit[0].details.new.room_id).toBe(room.id);
    expect(iso(audit[0].details.old.start_time)).toBe(slot.start);
    expect(iso(audit[0].details.new.start_time)).toBe(target.start);
  });

  test('owner moves booking to another room keeping the time', async () => {
    const { owner, booking, slot, room } = await seeded({ hour: 11 });
    const roomB = await createRoom();
    const res = await patch(owner.auth, booking.id, { room_id: roomB.id });
    expect(res.status).toBe(200);
    expect(res.body.room_id).toBe(roomB.id);
    expect(iso(res.body.start_time)).toBe(slot.start);
    const [hist] = await historyRows(booking.id);
    expect(hist.previous_room_id).toBe(room.id);
  });

  test('two reschedules produce two history rows', async () => {
    const { owner, booking } = await seeded({ hour: 9 });
    const a = futureSlot({ hour: 12 });
    const b = futureSlot({ hour: 13 });
    expect((await patch(owner.auth, booking.id, { start_time: a.start, end_time: a.end })).status).toBe(200);
    expect((await patch(owner.auth, booking.id, { start_time: b.start, end_time: b.end })).status).toBe(200);
    const hist = await historyRows(booking.id);
    expect(hist).toHaveLength(2);
    expect(iso(hist[1].previous_start_time)).toBe(a.start);
  });

  test('shifting within an overlapping window of the same booking is not a self-conflict', async () => {
    const { owner, booking, slot } = await seeded({ hour: 15 });
    const res = await patch(owner.auth, booking.id, { start_time: plusHours(slot.start, 0.5), end_time: plusHours(slot.end, 0.5) });
    expect(res.status).toBe(200);
  });

  test('target room occupied → 409, nothing changed, no history', async () => {
    const { owner, booking, slot } = await seeded({ hour: 10 });
    const roomB = await createRoom();
    const other = await createRep();
    await insertBooking({ room_id: roomB.id, created_by: other.user.id, start_time: slot.start, end_time: slot.end });
    const res = await patch(owner.auth, booking.id, { room_id: roomB.id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Room is already booked for this time period' });
    expect((await getBooking(booking.id)).room_id).toBe(booking.room_id);
    expect(await historyRows(booking.id)).toHaveLength(0);
  });

  test('user already busy at the target time → 409 naming the room', async () => {
    const { owner, booking } = await seeded({ hour: 10 });
    const target = futureSlot({ hour: 12 });
    const roomC = await createRoom();
    await insertBooking({ room_id: roomC.id, created_by: owner.user.id, start_time: target.start, end_time: target.end });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: `You already have another booking during this time in Room ${roomC.name}` });
  });

  test("another student cannot reschedule someone else's booking (403)", async () => {
    const { booking } = await seeded();
    const res = await patch((await createRep()).auth, booking.id, { room_id: (await createRoom()).id });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Not authorized' });
    expect(await historyRows(booking.id)).toHaveLength(0);
  });

  // QUESTION: admins can cancel anyone's booking but cannot reschedule it (owner-only). Intended?
  test('ADMIN cannot reschedule a booking they do not own (current behaviour: 403)', async () => {
    const { booking } = await seeded();
    const res = await patch((await createAdmin()).auth, booking.id, { room_id: (await createRoom()).id });
    expect(res.status).toBe(403);
  });

  test('VIEWER → 403 Forbidden (role gate); no token → 401', async () => {
    const viewer = await createViewer();
    const { booking } = await seeded({ owner: viewer });
    expect((await patch(viewer.auth, booking.id, { room_id: booking.room_id })).status).toBe(403);
    expect((await patch(null, booking.id, {})).status).toBe(401);
  });

  test('not found → 404; target room not found → 404; non-integer id → 400', async () => {
    const rep = await createRep();
    let res = await patch(rep.auth, 2147483000, {});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Booking not found' });

    const { owner, booking } = await seeded({ owner: rep });
    res = await patch(owner.auth, booking.id, { room_id: 2147483000 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Target room not found' });

    res = await patch(owner.auth, 'x1', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Valid booking ID required');
  });

  test('STUDENT_REP cannot move into a Committee Room / Auditorium (403)', async () => {
    const { owner, booking } = await seeded();
    for (const type of ['Committee Room', 'Auditorium']) {
      const res = await patch(owner.auth, booking.id, { room_id: (await createRoom({ type })).id });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Committee Rooms and Auditoriums can only be booked by Faculty or Admin');
    }
  });

  test('FACULTY owner may move into a Committee Room', async () => {
    const fac = await createFaculty();
    const { booking } = await seeded({ owner: fac });
    const res = await patch(fac.auth, booking.id, { room_id: (await createRoom({ type: 'Committee Room' })).id });
    expect(res.status).toBe(200);
  });

  test('STUDENT_REP cannot move to a weekend (400)', async () => {
    const { owner, booking } = await seeded();
    const sat = futureSlot({ hour: 10, weekend: true });
    const res = await patch(owner.auth, booking.id, { start_time: sat.start, end_time: sat.end });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Students are not allowed to book rooms on weekends' });
  });

  test.failing('[NEW-bookings-2] FACULTY may reschedule their own booking to a weekend (they may create weekend bookings)', async () => {
    const fac = await createFaculty();
    const { booking } = await seeded({ owner: fac });
    const sat = futureSlot({ hour: 10, weekend: true });
    const res = await patch(fac.auth, booking.id, { start_time: sat.start, end_time: sat.end });
    expect(res.status).toBe(200);
  });

  describe('BKG-07: reschedule skips the create-time rules', () => {
    test.failing('[BKG-07] moving a booking into the past → 400', async () => {
      const { owner, booking } = await seeded();
      const p = pastWeekdaySlot(10, 2);
      const res = await patch(owner.auth, booking.id, { start_time: p.start, end_time: p.end });
      expect(res.status).toBe(400);
    });

    test.failing('[BKG-07] moving a student booking beyond 7 days → 400', async () => {
      const { owner, booking } = await seeded();
      const far = farWeekdaySlot(10, 12);
      const res = await patch(owner.auth, booking.id, { start_time: far.start, end_time: far.end });
      expect(res.status).toBe(400);
    });

    test.failing('[BKG-07] STUDENT_REP moving into a student_access=false room → 403', async () => {
      const { owner, booking } = await seeded();
      const res = await patch(owner.auth, booking.id, { room_id: (await createRoom({ student_access: false })).id });
      expect(res.status).toBe(403);
    });

    test.failing('[BKG-07] end_time before start_time → 400 (currently 500)', async () => {
      const { owner, booking, slot } = await seeded();
      const res = await patch(owner.auth, booking.id, { start_time: slot.start, end_time: plusHours(slot.start, -1) });
      expect(res.status).toBe(400);
    });

    test('[BKG-07] invalid start_time string → 400 (currently 500)', async () => {
      const { owner, booking } = await seeded();
      const res = await patch(owner.auth, booking.id, { start_time: 'not-a-date' });
      expect(res.status).toBe(400);
    });

    test.failing('[BKG-07] a CANCELLED booking cannot be rescheduled', async () => {
      const { owner, booking } = await seeded({ status: 'CANCELLED' });
      const target = futureSlot({ hour: 14 });
      const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
      expect(res.status).toBe(400);
      expect(iso((await getBooking(booking.id)).start_time)).toBe(booking.start_time.toISOString());
    });

    test.failing('[BKG-07] moving into the student\'s own section timetable → 409', async () => {
      const dept = uniq('DEPT ');
      await insertTimetableSlot({ department: dept, semester: 3, section: 1, day_of_week: 'Thu', slot_time: '11:00-12:00', subject_name: 'Class' });
      const owner = await createRep({ branch: dept, semester: 3, section: 1 });
      const room = await createRoom();
      const free = futureSlot({ hour: 15, day: 'Thu', minLeadHours: 0 });
      const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: free.start, end_time: free.end });
      const target = futureSlot({ hour: 11, day: 'Thu', minLeadHours: 0 });
      const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
      expect(res.status).toBe(409);
    });
  });
});

describe('POST /api/bookings with RESCHEDULE booking type (BKG-04)', () => {
  // Shape sent by frontend BookingModal when bookingType === "RESCHEDULE".
  const payload = (room, slot, freedRoom, extra = {}) => ({
    room_id: room.id, start_time: slot.start, end_time: slot.end, faculty_id: null,
    purpose: 'Reschedule: DBMS lecture', reschedule_room_name: freedRoom.name, reschedule_day: 'Mon', reschedule_hour: 9, ...extra,
  });

  test.failing('[BKG-04] RESCHEDULE request creates the booking and frees the original room slot', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const freed = await createRoom();
    await db.query(`INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Mon', 9, false)`, [freed.id]);
    const res = await request(app).post('/api/bookings').set('Authorization', fac.auth)
      .send(payload(room, futureSlot({ hour: 12 }), freed));
    expect(res.status).toBe(201);
    const { rows: [ra] } = await db.query(`SELECT * FROM room_availability WHERE room_id = $1 AND day = 'Mon' AND hour = 9`, [freed.id]);
    expect(ra.is_available).toBe(true);
  });

  test('RESCHEDULE request currently fails (400 from the mis-typed user_id) and is fully rolled back (documents BKG-04)', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const freed = await createRoom();
    const res = await request(app).post('/api/bookings').set('Authorization', fac.auth)
      .send(payload(room, futureSlot({ hour: 13 }), freed));
    expect(res.status).toBe(400);
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('RESCHEDULE with an unknown reschedule_room_name → 404 and no booking left behind', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const res = await request(app).post('/api/bookings').set('Authorization', fac.auth)
      .send(payload(room, futureSlot({ hour: 14 }), { name: uniq('NOPE') }));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/^Room NOPE.* not found$/);
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('null reschedule_* fields (normal booking from the modal) are ignored', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const res = await request(app).post('/api/bookings').set('Authorization', rep.auth)
      .send(payload(room, futureSlot({ hour: 15 }), { name: null }, { reschedule_day: null, reschedule_hour: null }));
    expect(res.status).toBe(201);
  });
});

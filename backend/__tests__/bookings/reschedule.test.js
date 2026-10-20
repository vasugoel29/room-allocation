import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createFacultyEntry, createViewer, createRoom, insertBooking, futureSlot,
  approverId, closeDb,
} from '../../test/helpers/factories.js';
import {
  uniq, plusHours, pastWeekdaySlot, farWeekdaySlot, getBooking, auditRows, historyRows, insertTimetableSlot,
  releasesFor,
} from '../../test/helpers/bookings.js';
import { getIstParts } from '../../src/utils/timezone.js';
import { dateInSameWeek } from '../../src/services/bookingRules.js';

afterAll(closeDb);

const patch = (auth, id, body) => {
  const r = request(app).patch(`/api/bookings/${id}`);
  if (auth) r.set('Authorization', auth);
  return r.send(body);
};

async function seeded({ owner, hour = 10, hours = 1, status = 'ACTIVE', room, faculty_id = null } = {}) {
  owner = owner || (await createRep());
  room = room || (await createRoom());
  const s = futureSlot({ hour });
  const slot = { ...s, end: plusHours(s.start, hours) };
  const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, status, faculty_id });
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
    const { owner, booking, slot } = await seeded({ hour: 15, hours: 2 });
    const res = await patch(owner.auth, booking.id, { start_time: plusHours(slot.start, 1), end_time: plusHours(slot.end, 1) });
    expect(res.status).toBe(200);
    expect(iso(res.body.end_time)).toBe(plusHours(slot.end, 1));
  });

  test('start_time alone keeps the original length (end defaults to start + length)', async () => {
    const { owner, booking } = await seeded({ hour: 9, hours: 2 });
    const target = futureSlot({ hour: 13 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start });
    expect(res.status).toBe(200);
    expect(iso(res.body.start_time)).toBe(target.start);
    expect(iso(res.body.end_time)).toBe(plusHours(target.start, 2));
  });

  test('a PENDING request can be moved and stays PENDING with its faculty', async () => {
    const facultyId = await approverId();
    const { owner, booking } = await seeded({ hour: 10, status: 'PENDING', faculty_id: facultyId });
    const target = futureSlot({ hour: 16 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PENDING', faculty_id: facultyId });
  });

  test('a booking that has already started cannot be moved (400)', async () => {
    const owner = await createRep();
    const room = await createRoom();
    const start = new Date(Date.now() - 10 * 60_000).toISOString();
    const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: start, end_time: plusHours(start) });
    const target = futureSlot({ hour: 14 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Bookings that have started cannot be moved' });
  });

  test('[BKG-07] moving into a room during its own timetabled class → 409 room_timetable, nothing changed', async () => {
    const { owner, booking } = await seeded({ hour: 10 });
    const roomB = await createRoom();
    await insertTimetableSlot({ department: uniq('D '), semester: 1, section: 1, day_of_week: 'Wed', slot_time: '12:00-01:00', room_name: roomB.name, subject_name: 'Noon class' });
    const target = futureSlot({ hour: 12, day: 'Wed', minLeadHours: 0 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end, room_id: roomB.id });
    expect(res.status).toBe(409);
    expect(res.body.conflict).toMatchObject({ type: 'room_timetable', subject: 'Noon class', room: roomB.name });
    expect((await getBooking(booking.id)).room_id).toBe(booking.room_id);
  });

  test('[BKG-07] moving a request to a time its faculty member is teaching → 409 faculty_busy', async () => {
    const fac = await createFaculty({ name: uniq('Prof Move ') });
    await insertTimetableSlot({ department: uniq('D '), semester: 1, section: 1, day_of_week: 'Tue', slot_time: '03:00-04:00', faculty_name: fac.user.name, subject_name: 'Teaching' });
    const { owner, booking } = await seeded({ hour: 10, status: 'PENDING', faculty_id: fac.faculty.id });
    const target = futureSlot({ hour: 15, day: 'Tue', minLeadHours: 0 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
    expect(res.status).toBe(409);
    expect(res.body.conflict).toEqual({ type: 'faculty_busy' });
  });

  test('[NEW-P4-2] a student moving an approved (ACTIVE) booking goes back to PENDING for re-approval', async () => {
    // Approval is mandatory for students, but PATCH keeps status ACTIVE, so an approved request can be
    // moved to any other day/time/room without the faculty member ever seeing the new slot.
    const fac = await createFaculty();
    const { owner, booking } = await seeded({ hour: 10, status: 'ACTIVE', faculty_id: fac.faculty.id });
    const target = futureSlot({ hour: 15, skip: 1 });
    const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end, room_id: (await createRoom()).id });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PENDING');
  });

  test('target room occupied → 409, nothing changed, no history', async () => {
    const { owner, booking, slot } = await seeded({ hour: 10 });
    const roomB = await createRoom();
    const other = await createRep();
    await insertBooking({ room_id: roomB.id, created_by: other.user.id, start_time: slot.start, end_time: slot.end });
    const res = await patch(owner.auth, booking.id, { room_id: roomB.id });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Room is already booked for this time period', conflict: { type: 'room_booked' } });
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
    expect(res.body).toEqual({ error: `You already have another booking during this time in Room ${roomC.name}`, conflict: { type: 'person_busy' } });
  });

  test("another student cannot reschedule someone else's booking (403)", async () => {
    const { booking } = await seeded();
    const res = await patch((await createRep()).auth, booking.id, { room_id: (await createRoom()).id });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Not authorized' });
    expect(await historyRows(booking.id)).toHaveLength(0);
  });

  // Decision 2026-10-20: admins may move anyone's booking. The owner's commitments still apply and
  // the owner is notified; an admin's move doesn't send an approved booking back for re-approval.
  test('ADMIN moves someone else\'s booking: 200, status kept, owner notified', async () => {
    const fac = await createFaculty();
    const { owner, booking } = await seeded({ faculty_id: fac.faculty.id });
    const target = await createRoom();
    const admin = await createAdmin();
    const res = await patch(admin.auth, booking.id, { room_id: target.id });
    expect(res.status).toBe(200);
    expect(await getBooking(booking.id)).toMatchObject({ room_id: target.id, status: 'ACTIVE', created_by: owner.user.id });
    const { rows } = await db.query('SELECT type, body FROM notifications WHERE user_id = $1', [owner.user.id]);
    expect(rows).toEqual([expect.objectContaining({ type: 'booking_moved' })]);
    expect(rows[0].body).toContain(target.name);
  });

  test('ADMIN move still respects the owner\'s other bookings (409)', async () => {
    const { owner, booking } = await seeded({ hour: 10 });
    const busy = futureSlot({ hour: 15 });
    await insertBooking({ room_id: (await createRoom()).id, created_by: owner.user.id, start_time: busy.start });
    const res = await patch((await createAdmin()).auth, booking.id, { start_time: busy.start, end_time: busy.end });
    expect(res.status).toBe(409);
  });

  test('a non-admin who isn\'t the owner → 403', async () => {
    const { booking } = await seeded();
    expect((await patch((await createRep()).auth, booking.id, { room_id: booking.room_id })).status).toBe(403);
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
    expect(res.body).toEqual({ error: 'Room not found' });

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

  test('[NEW-bookings-2] FACULTY may reschedule their own booking to a weekend (they may create weekend bookings)', async () => {
    const fac = await createFaculty();
    const { booking } = await seeded({ owner: fac });
    const sat = futureSlot({ hour: 10, weekend: true });
    const res = await patch(fac.auth, booking.id, { start_time: sat.start, end_time: sat.end });
    expect(res.status).toBe(200);
    expect(iso(res.body.start_time)).toBe(sat.start);
  });

  describe('BKG-07: reschedule applies the create-time rules', () => {
    test('[BKG-07] moving a booking into the past → 400', async () => {
      const { owner, booking } = await seeded();
      const p = pastWeekdaySlot(10, 2);
      const res = await patch(owner.auth, booking.id, { start_time: p.start, end_time: p.end });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Cannot book in the past' });
    });

    test('[BKG-07] moving a student booking beyond 7 days → 400', async () => {
      const { owner, booking } = await seeded();
      const far = farWeekdaySlot(10, 12);
      const res = await patch(owner.auth, booking.id, { start_time: far.start, end_time: far.end });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Regular bookings allowed only for the current week' });
    });

    test('[BKG-07] STUDENT_REP moving into a student_access=false room → 403', async () => {
      const { owner, booking } = await seeded();
      const res = await patch(owner.auth, booking.id, { room_id: (await createRoom({ student_access: false })).id });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Students do not have permission to book this room' });
      expect(await historyRows(booking.id)).toHaveLength(0);
    });

    test('[BKG-07] end_time before start_time → 400 (was 500)', async () => {
      const { owner, booking, slot } = await seeded();
      const res = await patch(owner.auth, booking.id, { start_time: slot.start, end_time: plusHours(slot.start, -1) });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'end_time must be after start_time' });
    });

    test('[BKG-07] off-grid / too-long / out-of-hours times → 400', async () => {
      const { owner, booking, slot } = await seeded();
      for (const [start_time, end_time, error] of [
        [plusHours(slot.start, 0.5), plusHours(slot.start, 1.5), 'Bookings start and end on the hour'],
        [slot.start, plusHours(slot.start, 5), 'Bookings last between 1 and 4 hours'],
        [plusHours(slot.start, -3), plusHours(slot.start, -2), 'Rooms can be booked between 08:00 and 20:00'], // 07:00 IST
      ]) {
        const res = await patch(owner.auth, booking.id, { start_time, end_time });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error });
      }
    });

    test('[BKG-07] invalid start_time string → 400 (was 500)', async () => {
      const { owner, booking } = await seeded();
      const res = await patch(owner.auth, booking.id, { start_time: 'not-a-date' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'start_time and end_time must be valid timestamps' });
    });

    test.each([['CANCELLED'], ['REJECTED']])('[BKG-07] a %s booking cannot be rescheduled (409), row unchanged', async (status) => {
      const { owner, booking } = await seeded({ status });
      const target = futureSlot({ hour: 14 });
      const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: `A ${status.toLowerCase()} booking can't be moved` });
      expect(iso((await getBooking(booking.id)).start_time)).toBe(booking.start_time.toISOString());
      expect(await historyRows(booking.id)).toHaveLength(0);
    });

    test('[BKG-07] moving into the student\'s own section timetable → 409', async () => {
      const dept = uniq('DEPT ');
      await insertTimetableSlot({ department: dept, semester: 3, section: 1, day_of_week: 'Thu', slot_time: '11:00-12:00', subject_name: 'Class' });
      const owner = await createRep({ branch: dept, semester: 3, section: 1 });
      const room = await createRoom();
      const free = futureSlot({ hour: 15, day: 'Thu', minLeadHours: 0 });
      const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: free.start, end_time: free.end });
      const target = futureSlot({ hour: 11, day: 'Thu', minLeadHours: 0 });
      const res = await patch(owner.auth, booking.id, { start_time: target.start, end_time: target.end });
      expect(res.status).toBe(409);
      expect(res.body.conflict).toMatchObject({ type: 'timetable', label: 'your section timetable', time: '11:00-12:00' });
    });
  });
});

describe('POST /api/bookings with RESCHEDULE booking type (BKG-04)', () => {
  // Shape sent by frontend BookingModal when bookingType === "RESCHEDULE": the class normally held in
  // `freedRoom` on reschedule_day at reschedule_hour moves to this booking's room and time.
  const payload = (room, slot, freedRoom, extra = {}) => ({
    room_id: room.id, start_time: slot.start, end_time: slot.end, faculty_id: null,
    purpose: 'Reschedule: DBMS lecture', reschedule_room_name: freedRoom.name, reschedule_day: 'Mon', reschedule_hour: 9, ...extra,
  });
  const create = (auth, body) => request(app).post('/api/bookings').set('Authorization', auth).send(body);
  const ymd = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

  /** A room with a weekly class on Mon 09:00-10:00. */
  async function classroom() {
    const freed = await createRoom();
    await insertTimetableSlot({ department: uniq('D '), semester: 5, section: 1, day_of_week: 'Mon', slot_time: '09:00-10:00', room_name: freed.name, subject_name: 'DBMS' });
    return freed;
  }

  test('[BKG-04] FACULTY RESCHEDULE request → 201 ACTIVE, records the replaced class and releases it for that date only', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const freed = await classroom();
    const slot = futureSlot({ hour: 12 });
    const res = await create(fac.auth, payload(room, slot, freed));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');

    const expectedDate = dateInSameWeek(slot.dateKey, 'Mon');
    const row = await getBooking(res.body.id);
    expect(row.reschedule_room_id).toBe(freed.id);
    expect(ymd(row.reschedule_date)).toBe(expectedDate);
    expect(row.reschedule_hour).toBe(9);

    const releases = await releasesFor('reschedule', res.body.id);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ room_id: freed.id, start_hour: 9, end_hour: 10, is_active: true, created_by: fac.user.id });
    expect(ymd(releases[0].release_date)).toBe(expectedDate);
    // The weekly timetable / room_availability are not edited.
    expect((await db.query('SELECT 1 FROM room_availability WHERE room_id = $1', [freed.id])).rows).toHaveLength(0);
  });

  test('[BKG-04] the released class slot becomes bookable on that date (if it is still ahead)', async () => {
    const fac = await createFaculty();
    const freed = await classroom();
    const mon = futureSlot({ hour: 9, day: 'Mon', minLeadHours: 0 });
    // Before the reschedule the Monday class blocks the room.
    expect((await create((await createFaculty()).auth, { room_id: freed.id, start_time: mon.start, end_time: mon.end, purpose: 'x' })).status).toBe(409);
    // Move that Monday's class to another room at the same time (a later hour could fall outside the
    // 7-day window when today is Monday).
    const res = await create(fac.auth, payload(await createRoom(), mon, freed));
    expect(res.status).toBe(201);
    const other = await create((await createFaculty()).auth, { room_id: freed.id, start_time: mon.start, end_time: mon.end, purpose: 'Using the freed room' });
    expect(other.status).toBe(201);
  });

  test('[BKG-04] a student RESCHEDULE request is PENDING with no release until approved; approval creates it', async () => {
    const fac = await createFaculty();
    const rep = await createRep();
    const freed = await classroom();
    const slot = futureSlot({ hour: 14 });
    const res = await create(rep.auth, payload(await createRoom(), slot, freed, { faculty_id: fac.faculty.id }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(await releasesFor('reschedule', res.body.id)).toHaveLength(0);

    expect((await request(app).patch(`/api/faculty/${res.body.id}/approve`).set('Authorization', fac.auth)).status).toBe(200);
    const releases = await releasesFor('reschedule', res.body.id);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ room_id: freed.id, start_hour: 9, is_active: true, created_by: fac.user.id });
  });

  test('[BKG-04] a rejected RESCHEDULE request never creates a release', async () => {
    const fac = await createFaculty();
    const freed = await classroom();
    const res = await create((await createRep()).auth, payload(await createRoom(), futureSlot({ hour: 15 }), freed, { faculty_id: fac.faculty.id }));
    expect((await request(app).patch(`/api/faculty/${res.body.id}/reject`).set('Authorization', fac.auth)).status).toBe(200);
    expect(await releasesFor('reschedule', res.body.id)).toHaveLength(0);
  });

  test('[BKG-04] cancelling the RESCHEDULE booking withdraws its release (the class is back on)', async () => {
    const fac = await createFaculty();
    const freed = await classroom();
    const res = await create(fac.auth, payload(await createRoom(), futureSlot({ hour: 16 }), freed));
    expect(res.status).toBe(201);
    expect((await request(app).patch(`/api/bookings/${res.body.id}/cancel`).set('Authorization', fac.auth)).status).toBe(200);
    const [release] = await releasesFor('reschedule', res.body.id);
    expect(release.is_active).toBe(false);
    expect(release.deactivated_at).not.toBeNull();
  });

  test('reschedule_hour defaults to the booking start hour and reschedule_day to the booking date', async () => {
    const fac = await createFaculty();
    const freed = await createRoom();
    const slot = futureSlot({ hour: 11 });
    const res = await create(fac.auth, payload(await createRoom(), slot, freed, { reschedule_day: null, reschedule_hour: null }));
    expect(res.status).toBe(201);
    const row = await getBooking(res.body.id);
    expect(ymd(row.reschedule_date)).toBe(slot.dateKey);
    expect(row.reschedule_hour).toBe(11);
  });

  test.each([
    ['reschedule_day "Funday"', { reschedule_day: 'Funday' }, 'reschedule_day must be a weekday name (Mon–Sat)'],
    ['reschedule_hour 24', { reschedule_hour: 24 }, 'reschedule_hour must be an hour between 0 and 23'],
    ['reschedule_hour "nine"', { reschedule_hour: 'nine' }, 'reschedule_hour must be an hour between 0 and 23'],
  ])('%s → 400, nothing inserted', async (_n, extra, error) => {
    const fac = await createFaculty();
    const room = await createRoom();
    const res = await create(fac.auth, payload(room, futureSlot({ hour: 13 }), await createRoom(), extra));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('RESCHEDULE with an unknown reschedule_room_name → 404 and no booking left behind', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const res = await create(fac.auth, payload(room, futureSlot({ hour: 14 }), { name: uniq('NOPE') }));
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/^Room NOPE.* not found$/);
    expect((await db.query('SELECT 1 FROM bookings WHERE room_id = $1', [room.id])).rows).toHaveLength(0);
  });

  test('null reschedule_* fields (normal booking from the modal) are ignored', async () => {
    const rep = await createRep();
    const room = await createRoom();
    const res = await create(rep.auth,
      payload(room, futureSlot({ hour: 15 }), { name: null }, { reschedule_day: null, reschedule_hour: null, faculty_id: await approverId() }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING', reschedule_room_id: null, reschedule_date: null, reschedule_hour: null });
  });

  test('[NEW-P4-3] a RESCHEDULE booking cancelled by deleting its owner withdraws its release', async () => {
    // Only cancelBooking() withdraws reschedule releases. Other paths that cancel bookings (user
    // deactivation, room deletion, transfers, approved cancellation requests) leave the release active,
    // so the original room stays "free" during its class although the replacement booking is gone.
    const admin = await createAdmin();
    const fac = await createFaculty();
    const freed = await classroom();
    const res = await create(fac.auth, payload(await createRoom(), futureSlot({ hour: 17 }), freed));
    expect(res.status).toBe(201);
    await request(app).delete(`/api/auth/users/${fac.user.id}`).set('Authorization', admin.auth).expect(200);
    expect((await getBooking(res.body.id)).status).toBe('CANCELLED');
    const [release] = await releasesFor('reschedule', res.body.id);
    expect(release.is_active).toBe(false);
  });

  test('[NEW-P4-3] a RESCHEDULE booking cancelled by deleting its room withdraws its release', async () => {
    const admin = await createAdmin();
    const fac = await createFaculty();
    const freed = await classroom();
    const room = await createRoom();
    const res = await create(fac.auth, payload(room, futureSlot({ hour: 18 }), freed));
    expect(res.status).toBe(201);
    await request(app).delete(`/api/rooms/${room.id}`).set('Authorization', admin.auth).expect(200);
    expect((await getBooking(res.body.id)).status).toBe('CANCELLED');
    const [release] = await releasesFor('reschedule', res.body.id);
    expect(release.is_active).toBe(false);
  });
});

// Decision 2026-10-22: an admin booking over a timetabled class cancels that class for the date,
// tells the class's teacher and students, and creates the booking. Cancelling or moving the
// booking puts the class back and tells the same people.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createRep, createFaculty, createRoom, futureSlot, closeDb } from '../../test/helpers/factories.js';
import { insertTimetableSlot, plusHours, uniq } from '../../test/helpers/bookings.js';

afterAll(closeDb);

let admin;
beforeAll(async () => { admin = await createAdmin(); });

const book = (auth, body) => request(app).post('/api/bookings').set('Authorization', auth).send(body);
const notes = async (type, { userId, email }) => (await db.query(
  'SELECT title, body FROM notifications WHERE type = $1 AND (user_id = $2 OR lower(email) = lower($3)) ORDER BY id',
  [type, userId ?? null, email ?? null],
)).rows;
const releases = async (bookingId) => (await db.query(
  "SELECT start_hour, is_active FROM room_slot_releases WHERE source_type = 'admin_booking' AND source_id = $1 ORDER BY start_hour", [bookingId],
)).rows;

/** A room with a two-hour section class on `day` 11:00–13:00, its teacher and two students of the section. */
async function classInRoom(day = 'Wed') {
  const room = await createRoom();
  const teacher = await createFaculty({ name: uniq('Prof Displaced ') });
  const branch = uniq('BR ').toUpperCase();
  const [s1, s2] = await Promise.all([1, 2].map(() => createRep({ branch, semester: 3, section: 1 })));
  const other = await createRep({ branch, semester: 3, section: 2 }); // another section: not told
  await insertTimetableSlot({
    department: branch, semester: 3, section: 1, day_of_week: day, slot_time: '11:00-01:00',
    room_id: room.id, faculty_name: teacher.faculty.name, subject_name: 'Compilers',
  });
  return { room, teacher, students: [s1, s2], other, slot: futureSlot({ hour: 11, day, minLeadHours: 0 }) };
}

describe('admin booking over a timetabled class', () => {
  test('cancels the class for that date, tells its teacher and section, and creates the booking', async () => {
    const { room, teacher, students, other, slot } = await classInRoom('Wed');
    const res = await book(admin.auth, { room_id: room.id, start_time: slot.start, end_time: plusHours(slot.start, 1), purpose: 'Exam' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');

    // Only the booked hour (11–12) is released; 12–13 still has the class.
    expect(await releases(res.body.id)).toEqual([{ start_hour: 11, is_active: true }]);
    const { rows: override } = await db.query(
      'SELECT hour, is_cancelled, booking_id FROM faculty_slot_overrides WHERE faculty_id = $1 AND date = $2', [teacher.faculty.id, slot.dateKey]);
    expect(override).toEqual([{ hour: 11, is_cancelled: true, booking_id: res.body.id }]);

    expect(await notes('class_cancelled_for_booking', { userId: teacher.user.id, email: teacher.faculty.email })).toEqual([
      expect.objectContaining({ title: expect.stringContaining('Class cancelled: Compilers') }),
    ]);
    for (const s of students) expect(await notes('class_cancelled_for_booking', { userId: s.user.id })).toHaveLength(1);
    expect(await notes('class_cancelled_for_booking', { userId: other.user.id })).toEqual([]);

    // The teacher is free that hour; the room's next hour still has the class.
    const check = await request(app).get(`/api/timetable/faculty/check/${teacher.faculty.id}`).set('Authorization', admin.auth)
      .query({ date: slot.dateKey, hour: 11 });
    expect(check.body.isOccupied).toBe(false);
    const next = await book(admin.auth, { room_id: room.id, start_time: plusHours(slot.start, 1), end_time: plusHours(slot.start, 2), purpose: 'Second' });
    expect(next.status).toBe(201); // the admin may replace that hour too
    expect(await releases(next.body.id)).toEqual([{ start_hour: 12, is_active: true }]);
  });

  test('cancelling the booking puts the class back and tells the same people', async () => {
    const { room, teacher, students, slot } = await classInRoom('Thu');
    const res = await book(admin.auth, { room_id: room.id, start_time: slot.start, end_time: plusHours(slot.start, 2), purpose: 'Event' });
    expect(res.status).toBe(201);
    expect(await releases(res.body.id)).toEqual([{ start_hour: 11, is_active: true }, { start_hour: 12, is_active: true }]);

    expect((await request(app).patch(`/api/bookings/${res.body.id}/cancel`).set('Authorization', admin.auth)).status).toBe(200);
    expect(await releases(res.body.id)).toEqual([{ start_hour: 11, is_active: false }, { start_hour: 12, is_active: false }]);
    const { rows } = await db.query('SELECT bool_or(is_cancelled) AS any FROM faculty_slot_overrides WHERE booking_id = $1', [res.body.id]);
    expect(rows[0].any).toBe(false);
    expect(await notes('class_restored', { userId: teacher.user.id, email: teacher.faculty.email })).toHaveLength(1);
    expect(await notes('class_restored', { userId: students[0].user.id })).toEqual([
      expect.objectContaining({ body: expect.stringContaining('was cancelled') }),
    ]);
    // The class blocks the room again.
    const rep = await createRep();
    expect((await book(rep.auth, { room_id: room.id, start_time: slot.start, end_time: plusHours(slot.start, 1), purpose: 'x', faculty_id: teacher.faculty.id })).status).toBe(409);
  });

  test('an admin moving the booking away gives the class back; moving onto a class replaces it', async () => {
    const { room, students, slot } = await classInRoom('Tue');
    const res = await book(admin.auth, { room_id: room.id, start_time: plusHours(slot.start, -2), end_time: plusHours(slot.start, -1), purpose: 'Move me' });
    expect(res.status).toBe(201);
    expect(await releases(res.body.id)).toEqual([]);

    const onto = await request(app).patch(`/api/bookings/${res.body.id}`).set('Authorization', admin.auth)
      .send({ start_time: slot.start, end_time: plusHours(slot.start, 1) });
    expect(onto.status).toBe(200);
    expect(await releases(res.body.id)).toEqual([{ start_hour: 11, is_active: true }]);
    expect(await notes('class_cancelled_for_booking', { userId: students[0].user.id })).toHaveLength(1);

    const away = await request(app).patch(`/api/bookings/${res.body.id}`).set('Authorization', admin.auth)
      .send({ start_time: plusHours(slot.start, 4), end_time: plusHours(slot.start, 5) });
    expect(away.status).toBe(200);
    expect(await releases(res.body.id)).toEqual([{ start_hour: 11, is_active: false }]);
    expect(await notes('class_restored', { userId: students[0].user.id })).toEqual([
      expect.objectContaining({ body: expect.stringContaining('moved to another time') }),
    ]);
  });

  test('everyone else is still refused (409); an admin weekly block still has to be lifted first', async () => {
    const { room, teacher, slot } = await classInRoom('Mon');
    const fac = await createFaculty();
    expect((await book(fac.auth, { room_id: room.id, start_time: slot.start, end_time: plusHours(slot.start, 1), purpose: 'x' })).status).toBe(409);
    const rep = await createRep();
    expect((await book(rep.auth, { room_id: room.id, start_time: slot.start, end_time: plusHours(slot.start, 1), purpose: 'x', faculty_id: teacher.faculty.id })).status).toBe(409);

    const blocked = await createRoom();
    await db.query("INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, 'Mon', 11, false)", [blocked.id]);
    const res = await book(admin.auth, { room_id: blocked.id, start_time: slot.start, end_time: plusHours(slot.start, 1), purpose: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.conflict).toMatchObject({ type: 'room_blocked' });
  });
});

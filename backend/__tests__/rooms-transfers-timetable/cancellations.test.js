// Class cancellation requests: rep → faculty approval flow (timetableController).
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking,
  futureSlot, closeDb,
} from '../../test/helpers/factories.js';

afterAll(closeDb);

let n = 0;
const tag = () => `${process.pid.toString(36)}${Date.now().toString(36)}${(n++).toString(36)}`.toUpperCase();

const create = (auth, body) => request(app).post('/api/timetable/cancellation-requests').set('Authorization', auth).send(body);
const pending = (auth) => request(app).get('/api/timetable/cancellation-requests/pending').set('Authorization', auth);
const review = (auth, id, action) => request(app).patch(`/api/timetable/cancellation-requests/${id}/${action}`).set('Authorization', auth);
const reqRow = async (id) => (await db.query('SELECT * FROM class_cancellation_requests WHERE id = $1', [id])).rows[0];

let admin, viewer;
beforeAll(async () => { [admin, viewer] = await Promise.all([createAdmin(), createViewer()]); });

/** A faculty with a unique name, a rep, a room and a future class slot. */
async function setup() {
  const fname = `RTT Teacher ${tag()}`;
  const [fac, rep, room] = await Promise.all([createFaculty({ name: fname }), createRep(), createRoom()]);
  const slot = futureSlot({ hour: 10 });
  return { fac, rep, room, slot, body: { room_name: room.name, subject_name: 'DSA', date: slot.dateKey, hour: 10, faculty_name: fname } };
}

describe('POST /api/timetable/cancellation-requests', () => {
  test('401 without token; 403 for VIEWER', async () => {
    const s = await setup();
    expect((await request(app).post('/api/timetable/cancellation-requests').send(s.body)).status).toBe(401);
    expect((await create(viewer.auth, s.body)).status).toBe(403);
  });

  test.each(['room_name', 'date', 'hour', 'faculty_name'])('400 when %s is missing', async (field) => {
    const s = await setup();
    const body = { ...s.body };
    delete body[field];
    const res = await create(s.rep.auth, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Room, date, hour, and faculty are required.');
  });

  test('404 when the faculty name does not match a FACULTY user (a rep with that name does not count)', async () => {
    const s = await setup();
    const repName = `RTT NotFac ${tag()}`;
    await createRep({ name: repName });
    for (const faculty_name of [`Nobody ${tag()}`, repName]) {
      const res = await create(s.rep.auth, { ...s.body, faculty_name });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('The class faculty could not be found, so approval cannot be requested.');
    }
  });

  test('201 creates a PENDING request; faculty matched case-insensitively and trimmed', async () => {
    const s = await setup();
    const res = await create(s.rep.auth, { ...s.body, faculty_name: `  ${s.fac.user.name.toLowerCase()} ` });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Cancellation request sent to the faculty member for approval.');
    expect(res.body.request).toMatchObject({
      requested_by: s.rep.user.id, faculty_id: s.fac.user.id, room_name: s.room.name, subject_name: 'DSA', hour: 10, status: 'PENDING', booking_id: null,
    });
    const row = await reqRow(res.body.request.id);
    expect(row.reviewed_at).toBeNull();
  });

  test('409 for a duplicate PENDING request; allowed again once the first is rejected', async () => {
    const s = await setup();
    const first = await create(s.rep.auth, s.body);
    expect(first.status).toBe(201);
    const dup = await create(s.rep.auth, s.body);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('A cancellation request for this class is already awaiting faculty approval.');
    await review(s.fac.auth, first.body.request.id, 'reject').expect(200);
    expect((await create(s.rep.auth, s.body)).status).toBe(201);
  });

  test.failing('[NEW-RTT-8] an out-of-range hour returns 400 (currently 500 from the CHECK constraint)', async () => {
    const s = await setup();
    const res = await create(s.rep.auth, { ...s.body, hour: 25 });
    expect(res.status).toBe(400);
  });

  test.failing('[NEW-RTT-8] an invalid date returns 400 (currently 500)', async () => {
    const s = await setup();
    const res = await create(s.rep.auth, { ...s.body, date: 'someday' });
    expect(res.status).toBe(400);
  });

  test.failing('[BKG-12] a rep cannot attach someone else\'s booking_id to a cancellation request', async () => {
    const s = await setup();
    const victim = await createRep();
    const room = await createRoom();
    const vb = await insertBooking({ room_id: room.id, created_by: victim.user.id, start_time: futureSlot({ hour: 14 }).start });
    const res = await create(s.rep.auth, { ...s.body, booking_id: vb.id });
    expect([400, 403]).toContain(res.status);
  });

  test.failing('[BKG-12] a non-existent booking_id returns 400/404 (currently 500 FK violation)', async () => {
    const s = await setup();
    const res = await create(s.rep.auth, { ...s.body, booking_id: 987654321 });
    expect([400, 404]).toContain(res.status);
  });

  test('[BKG-12] (impact) approving a request that carries a victim\'s booking_id cancels the victim\'s booking', async () => {
    const s = await setup();
    const victim = await createRep();
    const room = await createRoom();
    const vb = await insertBooking({ room_id: room.id, created_by: victim.user.id, start_time: futureSlot({ hour: 15 }).start });
    const c = await create(s.rep.auth, { ...s.body, booking_id: vb.id });
    if (c.status !== 201) return; // fixed at creation time (see failing test above)
    await review(s.fac.auth, c.body.request.id, 'approve').expect(200);
    // Documents current behaviour: an unrelated user's booking is cancelled.
    expect((await db.query('SELECT status FROM bookings WHERE id = $1', [vb.id])).rows[0].status).toBe('CANCELLED');
  });
});

describe('GET /api/timetable/cancellation-requests/pending', () => {
  test('401; 403 for VIEWER and STUDENT_REP', async () => {
    const rep = await createRep();
    expect((await request(app).get('/api/timetable/cancellation-requests/pending')).status).toBe(401);
    for (const u of [viewer, rep]) expect((await pending(u.auth)).status).toBe(403);
  });

  test('a faculty sees only their own PENDING requests, with requester name', async () => {
    const a = await setup();
    const b = await setup();
    const ra = (await create(a.rep.auth, a.body)).body.request;
    const ra2 = (await create(a.rep.auth, { ...a.body, hour: 11 })).body.request;
    await create(b.rep.auth, b.body);
    await review(a.fac.auth, ra2.id, 'reject').expect(200);

    const res = await pending(a.fac.auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ id: ra.id, user_name: a.rep.user.name, status: 'PENDING' })]);
    expect((await pending(admin.auth)).body.map((r) => r.id)).not.toContain(ra.id);
  });
});

describe('PATCH /api/timetable/cancellation-requests/:id/:action', () => {
  test('401; 403 for STUDENT_REP; 400 for an unknown action', async () => {
    const s = await setup();
    const c = (await create(s.rep.auth, s.body)).body.request;
    expect((await request(app).patch(`/api/timetable/cancellation-requests/${c.id}/approve`)).status).toBe(401);
    expect((await review(s.rep.auth, c.id, 'approve')).status).toBe(403);
    const bad = await review(s.fac.auth, c.id, 'maybe');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid action.');
    expect((await reqRow(c.id)).status).toBe('PENDING');
  });

  test('another faculty (or an admin) cannot review it: 404 and status unchanged', async () => {
    const s = await setup();
    const other = await createFaculty();
    const c = (await create(s.rep.auth, s.body)).body.request;
    for (const u of [other, admin]) {
      const res = await review(u.auth, c.id, 'approve');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Cancellation request was not found or has already been reviewed.');
    }
    expect((await reqRow(c.id)).status).toBe('PENDING');
  });

  test('reject: REJECTED with reviewed_at, linked booking untouched; second review is 404', async () => {
    const s = await setup();
    const b = await insertBooking({ room_id: s.room.id, created_by: s.rep.user.id, start_time: s.slot.start });
    const c = (await create(s.rep.auth, { ...s.body, booking_id: b.id })).body.request;
    const res = await review(s.fac.auth, c.id, 'reject');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cancellation request rejected.');
    const row = await reqRow(c.id);
    expect(row.status).toBe('REJECTED');
    expect(row.reviewed_at).not.toBeNull();
    expect((await db.query('SELECT status FROM bookings WHERE id = $1', [b.id])).rows[0].status).toBe('ACTIVE');
    expect((await review(s.fac.auth, c.id, 'approve')).status).toBe(404);
  });

  test('approve with booking_id: booking CANCELLED (cancelled_at set), request APPROVED', async () => {
    const s = await setup();
    const b = await insertBooking({ room_id: s.room.id, created_by: s.rep.user.id, start_time: s.slot.start });
    const c = (await create(s.rep.auth, { ...s.body, booking_id: b.id })).body.request;
    const res = await review(s.fac.auth, c.id, 'approve');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cancellation approved; the room is now available.');
    const bk = (await db.query('SELECT status, cancelled_at FROM bookings WHERE id = $1', [b.id])).rows[0];
    expect(bk.status).toBe('CANCELLED');
    expect(bk.cancelled_at).not.toBeNull();
    expect((await reqRow(c.id)).status).toBe('APPROVED');
  });

  test.failing('[BKG-05] approving a timetable-class cancellation (no booking_id) succeeds and frees only that date, not the weekday every week', async () => {
    const s = await setup();
    await db.query('INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, $2, 10, false)', [s.room.id, s.slot.day]);
    const c = (await create(s.rep.auth, s.body)).body.request;
    const res = await review(s.fac.auth, c.id, 'approve');
    expect(res.status).toBe(200); // currently 500: Date written into room_availability.day VARCHAR(20)
    expect((await reqRow(c.id)).status).toBe('APPROVED');
    // the recurring weekly slot must still be blocked for other weeks
    const { rows } = await db.query('SELECT is_available FROM room_availability WHERE room_id = $1 AND day = $2 AND hour = 10', [s.room.id, s.slot.day]);
    expect(rows).toEqual([{ is_available: false }]);
  });

  test('[BKG-05] (current) the failed approval rolls back: request stays PENDING, no availability row changes', async () => {
    const s = await setup();
    const c = (await create(s.rep.auth, s.body)).body.request;
    const res = await review(s.fac.auth, c.id, 'approve');
    if (res.status === 200) return; // fixed – covered by the failing test above
    expect(res.status).toBe(500);
    expect((await reqRow(c.id)).status).toBe('PENDING');
    expect((await db.query('SELECT 1 FROM room_availability WHERE room_id = $1', [s.room.id])).rowCount).toBe(0);
  });

  test.failing('[BKG-16] approving a booking cancellation is reflected in admin room status immediately', async () => {
    const s = await setup();
    const b = await insertBooking({ room_id: s.room.id, created_by: s.rep.user.id, start_time: s.slot.start });
    const q = { date: s.slot.dateKey, slot: 10 };
    const before = await request(app).get('/api/rooms/admin/status').set('Authorization', admin.auth).query(q);
    expect(before.body.find((r) => r.room_id === s.room.id).booking_id).toBe(b.id);
    const c = (await create(s.rep.auth, { ...s.body, booking_id: b.id })).body.request;
    await review(s.fac.auth, c.id, 'approve').expect(200);
    const after = await request(app).get('/api/rooms/admin/status').set('Authorization', admin.auth).query(q);
    expect(after.body.find((r) => r.room_id === s.room.id).booking_id).toBeNull();
  });
});

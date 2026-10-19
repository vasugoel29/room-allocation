import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { pastWeekdaySlot, getBooking, auditRows } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const cancel = (auth, id) => {
  const r = request(app).patch(`/api/bookings/${id}/cancel`);
  if (auth) r.set('Authorization', auth);
  return r.send();
};

async function seeded({ status = 'ACTIVE', faculty_id = null, slot = futureSlot({ hour: 10 }), owner } = {}) {
  owner = owner || (await createRep());
  const room = await createRoom();
  const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end, status, faculty_id });
  return { owner, room, booking, slot };
}

describe('PATCH /api/bookings/:id/cancel', () => {
  test('owner cancels own booking: 200, status CANCELLED, cancelled_at set, audit row', async () => {
    const { owner, booking } = await seeded();
    const before = Date.now();
    const res = await cancel(owner.auth, booking.id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'Success', message: 'Booking cancelled' });

    const row = await getBooking(booking.id);
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelled_at).not.toBeNull();
    expect(new Date(row.cancelled_at).getTime()).toBeGreaterThanOrEqual(before - 5000);

    const audit = await auditRows(booking.id, 'CANCEL_BOOKING');
    expect(audit).toHaveLength(1);
    expect(audit[0].user_id).toBe(owner.user.id);
    expect(audit[0].details).toMatchObject({ previous_status: 'ACTIVE' });
  });

  test('cancelling frees the slot for someone else', async () => {
    const { owner, room, booking, slot } = await seeded({ slot: futureSlot({ hour: 11 }) });
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    const other = await createRep();
    const res = await request(app).post('/api/bookings').set('Authorization', other.auth)
      .send({ room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Rebook' });
    expect(res.status).toBe(201);
  });

  test("another student cannot cancel someone else's booking (403, unchanged)", async () => {
    const { booking } = await seeded();
    const other = await createRep();
    const res = await cancel(other.auth, booking.id);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Not authorized' });
    const row = await getBooking(booking.id);
    expect(row.status).toBe('ACTIVE');
    expect(row.cancelled_at).toBeNull();
    expect(await auditRows(booking.id, 'CANCEL_BOOKING')).toHaveLength(0);
  });

  test('an unrelated FACULTY member cannot cancel (403)', async () => {
    const { booking } = await seeded();
    const res = await cancel((await createFaculty()).auth, booking.id);
    expect(res.status).toBe(403);
    expect((await getBooking(booking.id)).status).toBe('ACTIVE');
  });

  test('ADMIN can cancel any booking; audit attributes the admin', async () => {
    const { booking } = await seeded();
    const admin = await createAdmin();
    const res = await cancel(admin.auth, booking.id);
    expect(res.status).toBe(200);
    expect((await getBooking(booking.id)).status).toBe('CANCELLED');
    const [audit] = await auditRows(booking.id, 'CANCEL_BOOKING');
    expect(audit.user_id).toBe(admin.user.id);
  });

  test('assigned faculty can cancel the booking they supervise', async () => {
    const fac = await createFaculty();
    const { booking } = await seeded({ status: 'PENDING', faculty_id: fac.faculty.id });
    const res = await cancel(fac.auth, booking.id);
    expect(res.status).toBe(200);
    expect((await getBooking(booking.id)).status).toBe('CANCELLED');
    const [audit] = await auditRows(booking.id, 'CANCEL_BOOKING');
    expect(audit.details.previous_status).toBe('PENDING');
  });

  test('creator can withdraw their own PENDING request', async () => {
    const fac = await createFaculty();
    const { owner, booking } = await seeded({ status: 'PENDING', faculty_id: fac.faculty.id });
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    expect((await getBooking(booking.id)).status).toBe('CANCELLED');
  });

  // QUESTION: cancel has no role gate, so a VIEWER who owns a booking (e.g. a demoted rep or a transfer
  // recipient) can cancel it. Documenting current behaviour.
  test('VIEWER owner can cancel their booking (no role gate on cancel)', async () => {
    const viewer = await createViewer();
    const { booking } = await seeded({ owner: viewer });
    expect((await cancel(viewer.auth, booking.id)).status).toBe(200);
  });

  test('not found → 404', async () => {
    const res = await cancel((await createAdmin()).auth, 2147483000);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Booking not found' });
  });

  test('non-integer id → 400', async () => {
    const res = await cancel((await createRep()).auth, 'abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Valid booking ID required');
  });

  test('no token → 401; bad token → 401', async () => {
    const { booking } = await seeded();
    expect((await cancel(null, booking.id)).status).toBe(401);
    expect((await cancel('Bearer nope', booking.id)).status).toBe(401);
    expect((await getBooking(booking.id)).status).toBe('ACTIVE');
  });

  test.failing('[NEW-bookings-1] cancelling an already-CANCELLED booking is refused and keeps the original cancelled_at', async () => {
    const { owner, booking } = await seeded();
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    const first = (await getBooking(booking.id)).cancelled_at;
    await new Promise((r) => setTimeout(r, 20));
    const res = await cancel(owner.auth, booking.id);
    expect(res.status).toBe(400);
    expect((await getBooking(booking.id)).cancelled_at).toEqual(first);
    expect(await auditRows(booking.id, 'CANCEL_BOOKING')).toHaveLength(1);
  });

  test.failing('[BKG-17] cancelling a REJECTED booking is refused and status stays REJECTED', async () => {
    const fac = await createFaculty();
    const { owner, booking } = await seeded({ status: 'REJECTED', faculty_id: fac.faculty.id });
    const res = await cancel(owner.auth, booking.id);
    expect(res.status).toBe(400);
    expect((await getBooking(booking.id)).status).toBe('REJECTED');
  });

  test.failing('[BKG-17] cancelling a booking that already took place is refused', async () => {
    const { owner, booking } = await seeded({ slot: pastWeekdaySlot(10, 2) });
    const res = await cancel(owner.auth, booking.id);
    expect(res.status).toBe(400);
    expect((await getBooking(booking.id)).status).toBe('ACTIVE');
  });

  test.failing('[BKG-17] cancelling a booking closes its open transfer requests', async () => {
    const { owner, booking } = await seeded({ slot: futureSlot({ hour: 15 }) });
    const requester = await createRep();
    const { rows: [tr] } = await db.query(
      `INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose, status)
       VALUES ($1, $2, $3, 'take over', 'PENDING') RETURNING *`, [booking.id, requester.user.id, owner.user.id]);
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    const { rows: [after] } = await db.query('SELECT status FROM booking_transfers WHERE id = $1', [tr.id]);
    expect(after.status).not.toBe('PENDING');
  });
});

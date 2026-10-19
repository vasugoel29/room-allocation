import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, futureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { pastWeekdaySlot, plusHours, getBooking, auditRows } from '../../test/helpers/bookings.js';

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
    const other = await createFaculty(); // staff bookings are ACTIVE, so they really need the room free
    const body = { room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'Rebook' };
    expect((await request(app).post('/api/bookings').set('Authorization', other.auth).send(body)).status).toBe(409);
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    const res = await request(app).post('/api/bookings').set('Authorization', other.auth).send(body);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  test('a booking in progress (started, not ended) can still be cancelled', async () => {
    const start = new Date(Date.now() - 15 * 60_000).toISOString();
    const { owner, booking } = await seeded({ slot: { start, end: plusHours(start) } });
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    expect((await getBooking(booking.id)).status).toBe('CANCELLED');
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

  test('[NEW-bookings-1] cancelling an already-CANCELLED booking is refused (409) and keeps the original cancelled_at', async () => {
    const { owner, booking } = await seeded();
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    const first = (await getBooking(booking.id)).cancelled_at;
    await new Promise((r) => setTimeout(r, 20));
    const res = await cancel(owner.auth, booking.id);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'This booking is already cancelled' });
    expect((await getBooking(booking.id)).cancelled_at).toEqual(first);
    expect(await auditRows(booking.id, 'CANCEL_BOOKING')).toHaveLength(1);
  });

  test('[BKG-17] cancelling a REJECTED booking is refused (409) and status stays REJECTED, even for an admin', async () => {
    const fac = await createFaculty();
    const { owner, booking } = await seeded({ status: 'REJECTED', faculty_id: fac.faculty.id });
    for (const who of [owner, fac, await createAdmin()]) {
      const res = await cancel(who.auth, booking.id);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'This booking is already rejected' });
    }
    expect((await getBooking(booking.id)).status).toBe('REJECTED');
    expect(await auditRows(booking.id, 'CANCEL_BOOKING')).toHaveLength(0);
  });

  test('[BKG-17] cancelling a booking that already took place is refused (400)', async () => {
    const { owner, booking } = await seeded({ slot: pastWeekdaySlot(10, 2) });
    const res = await cancel(owner.auth, booking.id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Past bookings cannot be cancelled' });
    expect((await getBooking(booking.id)).status).toBe('ACTIVE');
  });

  test('[BKG-17] cancelling a booking closes its open transfer requests (REJECTED); finished ones are kept', async () => {
    const { owner, booking } = await seeded({ slot: futureSlot({ hour: 15 }) });
    const requester = await createRep();
    const { rows: [tr] } = await db.query(
      `INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose, status)
       VALUES ($1, $2, $3, 'take over', 'PENDING') RETURNING *`, [booking.id, requester.user.id, owner.user.id]);
    const { rows: [mid] } = await db.query(
      `INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose, status)
       VALUES ($1, $2, $3, 'mid-flow', 'REP2_ACCEPTED') RETURNING *`, [booking.id, (await createRep()).user.id, owner.user.id]);
    const { rows: [done] } = await db.query(
      `INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose, status)
       VALUES ($1, $2, $3, 'old', 'ACCEPTED') RETURNING *`, [booking.id, (await createRep()).user.id, owner.user.id]);
    expect((await cancel(owner.auth, booking.id)).status).toBe(200);
    const statusOf = async (id) => (await db.query('SELECT status FROM booking_transfers WHERE id = $1', [id])).rows[0].status;
    expect(await statusOf(tr.id)).toBe('REJECTED');
    expect(await statusOf(mid.id)).toBe('REJECTED');
    expect(await statusOf(done.id)).toBe('ACCEPTED');
  });
});

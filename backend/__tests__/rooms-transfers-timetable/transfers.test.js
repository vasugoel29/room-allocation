// Booking transfer state machine (transferRoutes / transferService / transferRepository).
//
// States (transferService.acceptTransfer):
//   PENDING --owner (booking.created_by) accepts-->
//       booking.faculty_id set   -> REP2_ACCEPTED (booking still ACTIVE)
//       no owner faculty         -> booking CANCELLED, then
//             target_faculty_id  -> FACULTY2_ACCEPTED
//             none               -> ACCEPTED (booking reassigned, ACTIVE)
//   REP2_ACCEPTED --owner faculty accepts--> booking CANCELLED, then FACULTY2_ACCEPTED or ACCEPTED
//   FACULTY2_ACCEPTED --target faculty accepts--> ACCEPTED (booking reassigned to requester, faculty_id = target)
// ADMIN can perform any step. Reject: owner, owner faculty, target faculty or ADMIN, any state.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createFacultyEntry, createViewer, createRoom, insertBooking,
  futureSlot, pastSlot, closeDb,
} from '../../test/helpers/factories.js';

afterAll(closeDb);

let admin;
beforeAll(async () => { admin = await createAdmin(); });

const post = (auth, body) => request(app).post('/api/transfers/request').set('Authorization', auth).send(body);
const accept = (auth, id) => request(app).patch(`/api/transfers/${id}/accept`).set('Authorization', auth);
const reject = (auth, id) => request(app).patch(`/api/transfers/${id}/reject`).set('Authorization', auth);
const incoming = (auth) => request(app).get('/api/transfers/incoming').set('Authorization', auth);
const outgoing = (auth) => request(app).get('/api/transfers/outgoing').set('Authorization', auth);
const bookingRow = async (id) => (await db.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0];
const transferRow = async (id) => (await db.query('SELECT * FROM booking_transfers WHERE id = $1', [id])).rows[0];

let hourSeq = 0;
/**
 * Owner rep with an ACTIVE future booking, and a requester rep.
 * ownerFaculty: booking.faculty_id is a faculty-directory entry linked to a FACULTY account.
 * targetFaculty: requester names such an entry (target_faculty_id = faculties.id).
 */
async function scenario({ ownerFaculty = false, targetFaculty = false, booking = {} } = {}) {
  const [owner, requester, room] = await Promise.all([createRep(), createRep(), createRoom()]);
  const ownerFac = ownerFaculty ? await createFaculty() : null;
  const targetFac = targetFaculty ? await createFaculty() : null;
  const slot = futureSlot({ hour: 8 + (hourSeq++ % 10) });
  const b = await insertBooking({
    room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end,
    purpose: 'Original purpose', faculty_id: ownerFac?.faculty.id ?? null, ...booking,
  });
  return { owner, requester, room, ownerFac, targetFac, booking: b, slot };
}

async function requestFor(s, extra = {}) {
  const res = await post(s.requester.auth, {
    booking_id: s.booking.id, new_purpose: 'Transferred purpose',
    ...(s.targetFac ? { target_faculty_id: s.targetFac.faculty.id } : {}), ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.transfer;
}

// ─── POST /api/transfers/request ─────────────────────────────────────────────
describe('POST /api/transfers/request', () => {
  test('401 without / with a bad token', async () => {
    expect((await request(app).post('/api/transfers/request').send({ booking_id: 1 })).status).toBe(401);
    expect((await post('Bearer nope', { booking_id: 1 })).status).toBe(401);
  });

  test('201 creates a PENDING transfer with owner_id, purpose and target faculty; audit row written', async () => {
    const s = await scenario({ targetFaculty: true });
    const res = await post(s.requester.auth, { booking_id: s.booking.id, new_purpose: 'Need it', target_faculty_id: s.targetFac.faculty.id });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Transfer request sent');
    expect(res.body.transfer).toMatchObject({
      booking_id: s.booking.id, requested_by: s.requester.user.id, owner_id: s.owner.user.id,
      target_faculty_id: s.targetFac.faculty.id, new_purpose: 'Need it', status: 'PENDING',
    });
    const { rows } = await db.query(
      "SELECT details FROM audit_logs WHERE action = 'REQUEST_TRANSFER' AND entity_id = $1 AND user_id = $2",
      [res.body.transfer.id, s.requester.user.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toMatchObject({ booking_id: s.booking.id, new_purpose: 'Need it' });
    // booking untouched by a request
    expect(await bookingRow(s.booking.id)).toMatchObject({ status: 'ACTIVE', created_by: s.owner.user.id });
  });

  test('404 for an unknown booking', async () => {
    const r = await createRep();
    const res = await post(r.auth, { booking_id: 987654321 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Target booking not found');
  });

  test('400 when requesting your own booking', async () => {
    const s = await scenario();
    const res = await post(s.owner.auth, { booking_id: s.booking.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot request transfer from yourself.');
  });

  test.each([['CANCELLED'], ['PENDING'], ['REJECTED']])('400 for a %s booking', async (status) => {
    const s = await scenario({ booking: { status } });
    const res = await post(s.requester.auth, { booking_id: s.booking.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Can only request transfer for an ACTIVE booking.');
  });

  test('400 for a duplicate open request by the same requester', async () => {
    const s = await scenario();
    await requestFor(s);
    const res = await post(s.requester.auth, { booking_id: s.booking.id, new_purpose: 'again' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You have already requested this booking.');
    expect((await db.query('SELECT 1 FROM booking_transfers WHERE booking_id = $1', [s.booking.id])).rowCount).toBe(1);
  });

  test('a rep cannot request a booking owned by FACULTY or ADMIN (403); an ADMIN can', async () => {
    const fac = await createFaculty();
    const room = await createRoom();
    const rep = await createRep();
    const slot = futureSlot({ hour: 9 });
    const fb = await insertBooking({ room_id: room.id, created_by: fac.user.id, start_time: slot.start });
    const res = await post(rep.auth, { booking_id: fb.id });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Cannot request transfers for faculty or admin bookings.');

    const room2 = await createRoom();
    const ab = await insertBooking({ room_id: room2.id, created_by: admin.user.id, start_time: slot.start });
    expect((await post(rep.auth, { booking_id: ab.id })).status).toBe(403);

    const ok = await post(admin.auth, { booking_id: fb.id, new_purpose: 'Admin needs it' });
    expect(ok.status).toBe(201);
  });

  test('[SEC-06] a VIEWER cannot request a transfer', async () => {
    const s = await scenario();
    const v = await createViewer();
    const res = await post(v.auth, { booking_id: s.booking.id, new_purpose: 'viewer' });
    expect(res.status).toBe(403);
  });

  // SEC-06 (fixed): target_faculty_id must be an ACTIVE faculty-directory entry (faculties.id).
  const NOT_FOUND = { error: 'Selected faculty member was not found' };
  const noTransfer = async (s) => (await db.query('SELECT 1 FROM booking_transfers WHERE booking_id = $1', [s.booking.id])).rowCount === 0;

  test('[SEC-06] target_faculty_id must be a faculty-directory entry (self is rejected)', async () => {
    const s = await scenario();
    const res = await post(s.requester.auth, { booking_id: s.booking.id, target_faculty_id: s.requester.user.id });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
    expect(await noTransfer(s)).toBe(true);
  });

  test('[SEC-06] target_faculty_id must be a faculty-directory entry (another rep is rejected)', async () => {
    const s = await scenario();
    const accomplice = await createRep();
    const res = await post(s.requester.auth, { booking_id: s.booking.id, target_faculty_id: accomplice.user.id });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
    expect(await noTransfer(s)).toBe(true);
  });

  test('[SEC-06] an unknown target_faculty_id is a 400, not a 500 (FK violation)', async () => {
    const s = await scenario();
    const res = await post(s.requester.auth, { booking_id: s.booking.id, target_faculty_id: 987654321 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
  });

  test('[SEC-06] a requester who names themselves as target faculty is refused at request time', async () => {
    const s = await scenario();
    const res = await post(s.requester.auth, { booking_id: s.booking.id, target_faculty_id: s.requester.user.id, new_purpose: 'self-approved' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(NOT_FOUND);
    expect(await noTransfer(s)).toBe(true);
    expect((await bookingRow(s.booking.id)).created_by).toBe(s.owner.user.id);
  });

  test('a FACULTY account\'s user id or a soft-deleted directory entry is rejected as target_faculty_id', async () => {
    const s = await scenario();
    const fac = await createFaculty();
    const inactive = await createFacultyEntry({ is_active: false });
    for (const target_faculty_id of [fac.user.id, inactive.id]) {
      const res = await post(s.requester.auth, { booking_id: s.booking.id, target_faculty_id });
      expect(res.status).toBe(400);
      expect(res.body).toEqual(NOT_FOUND);
    }
    expect(await noTransfer(s)).toBe(true);
  });

  test('a directory entry without a sign-in account is a valid target_faculty_id', async () => {
    const s = await scenario();
    const entry = await createFacultyEntry();
    const res = await post(s.requester.auth, { booking_id: s.booking.id, target_faculty_id: entry.id, new_purpose: 'dir only' });
    expect(res.status).toBe(201);
    expect(res.body.transfer).toMatchObject({ target_faculty_id: entry.id, status: 'PENDING' });
  });

  test.failing('[BKG-06] a transfer cannot be requested for a booking that has already ended', async () => {
    const owner = await createRep();
    const requester = await createRep();
    const room = await createRoom();
    const p = pastSlot(30);
    const b = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: p.start, end_time: p.end });
    const res = await post(requester.auth, { booking_id: b.id });
    expect(res.status).toBe(400);
  });
});

// ─── Happy paths ─────────────────────────────────────────────────────────────
describe('transfer happy paths', () => {
  test('no owner faculty, no target faculty: owner accept completes immediately', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    const other = await createRep();
    const tOther = (await post(other.auth, { booking_id: s.booking.id, new_purpose: 'loser' })).body.transfer;

    const res = await accept(s.owner.auth, t.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Transfer completed successfully');
    expect(await bookingRow(s.booking.id)).toMatchObject({
      status: 'ACTIVE', created_by: s.requester.user.id, purpose: 'Transferred purpose', faculty_id: null,
    });
    expect((await transferRow(t.id)).status).toBe('ACCEPTED');
    expect((await transferRow(tOther.id)).status).toBe('REJECTED'); // other pending requests closed
    const { rowCount } = await db.query("SELECT 1 FROM audit_logs WHERE action = 'ACCEPT_TRANSFER_REP2_COMPLETED' AND entity_id = $1", [t.id]);
    expect(rowCount).toBe(1);
  });

  test('no owner faculty, with target faculty: owner → FACULTY2_ACCEPTED → target faculty completes', async () => {
    const s = await scenario({ targetFaculty: true });
    const t = await requestFor(s);

    const step1 = await accept(s.owner.auth, t.id);
    expect(step1.status).toBe(200);
    expect(step1.body.message).toBe('Class owner accepted. Pending approval from requester faculty.');
    expect((await transferRow(t.id)).status).toBe('FACULTY2_ACCEPTED');
    expect((await bookingRow(s.booking.id)).status).toBe('CANCELLED'); // freed mid-flow (see BKG-06 tests)

    const step2 = await accept(s.targetFac.auth, t.id);
    expect(step2.status).toBe(200);
    expect(step2.body.message).toBe('Transfer completed successfully');
    expect(await bookingRow(s.booking.id)).toMatchObject({
      status: 'ACTIVE', created_by: s.requester.user.id, faculty_id: s.targetFac.faculty.id, purpose: 'Transferred purpose',
    });
    expect((await transferRow(t.id)).status).toBe('ACCEPTED');
  });

  test('owner faculty, no target faculty: owner → REP2_ACCEPTED → owner faculty completes', async () => {
    const s = await scenario({ ownerFaculty: true });
    const t = await requestFor(s);

    const step1 = await accept(s.owner.auth, t.id);
    expect(step1.status).toBe(200);
    expect(step1.body.message).toBe('Transfer accepted by class owner. Pending approval from owner faculty.');
    expect((await transferRow(t.id)).status).toBe('REP2_ACCEPTED');
    expect((await bookingRow(s.booking.id)).status).toBe('ACTIVE');

    const step2 = await accept(s.ownerFac.auth, t.id);
    expect(step2.status).toBe(200);
    expect(step2.body.message).toBe('Transfer completed successfully');
    expect(await bookingRow(s.booking.id)).toMatchObject({ status: 'ACTIVE', created_by: s.requester.user.id, faculty_id: null });
    expect((await transferRow(t.id)).status).toBe('ACCEPTED');
  });

  test('owner faculty and target faculty: PENDING → REP2_ACCEPTED → FACULTY2_ACCEPTED → ACCEPTED', async () => {
    const s = await scenario({ ownerFaculty: true, targetFaculty: true });
    const t = await requestFor(s);

    expect((await accept(s.owner.auth, t.id)).status).toBe(200);
    expect((await transferRow(t.id)).status).toBe('REP2_ACCEPTED');

    const step2 = await accept(s.ownerFac.auth, t.id);
    expect(step2.status).toBe(200);
    expect(step2.body.message).toBe('Owner faculty approved. Pending approval from requester faculty.');
    expect((await transferRow(t.id)).status).toBe('FACULTY2_ACCEPTED');
    expect((await bookingRow(s.booking.id)).status).toBe('CANCELLED');

    expect((await accept(s.targetFac.auth, t.id)).status).toBe(200);
    expect(await bookingRow(s.booking.id)).toMatchObject({ status: 'ACTIVE', created_by: s.requester.user.id, faculty_id: s.targetFac.faculty.id });
    expect((await transferRow(t.id)).status).toBe('ACCEPTED');
    const { rows } = await db.query("SELECT action FROM audit_logs WHERE entity_type = 'transfer' AND entity_id = $1 ORDER BY id", [t.id]);
    expect(rows.map((r) => r.action)).toEqual(['REQUEST_TRANSFER', 'ACCEPT_TRANSFER_REP2', 'APPROVE_TRANSFER_FACULTY2', 'APPROVE_TRANSFER_FACULTY1']);
  });

  test('ADMIN can drive every step', async () => {
    const s = await scenario({ ownerFaculty: true, targetFaculty: true });
    const t = await requestFor(s);
    for (const expected of ['REP2_ACCEPTED', 'FACULTY2_ACCEPTED', 'ACCEPTED']) {
      expect((await accept(admin.auth, t.id)).status).toBe(200);
      expect((await transferRow(t.id)).status).toBe(expected);
    }
    expect((await bookingRow(s.booking.id)).created_by).toBe(s.requester.user.id);
  });
});

// ─── Authorization & invalid transitions ─────────────────────────────────────
describe('transfer authorization and invalid transitions', () => {
  test('PENDING: requester, an unrelated rep and the target faculty cannot accept (403)', async () => {
    const s = await scenario({ targetFaculty: true });
    const t = await requestFor(s);
    const stranger = await createRep();
    for (const u of [s.requester, stranger, s.targetFac]) {
      const res = await accept(u.auth, t.id);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to accept this transfer.');
    }
    expect((await transferRow(t.id)).status).toBe('PENDING');
    expect((await bookingRow(s.booking.id)).status).toBe('ACTIVE');
  });

  test('REP2_ACCEPTED: only the owner faculty (or admin) may approve', async () => {
    const s = await scenario({ ownerFaculty: true, targetFaculty: true });
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id);
    const otherFac = await createFaculty();
    for (const u of [s.owner, s.requester, s.targetFac, otherFac]) {
      const res = await accept(u.auth, t.id);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to approve this transfer.');
    }
    expect((await transferRow(t.id)).status).toBe('REP2_ACCEPTED');
    expect((await bookingRow(s.booking.id)).status).toBe('ACTIVE');
  });

  test('FACULTY2_ACCEPTED: only the target faculty (or admin) may approve', async () => {
    const s = await scenario({ ownerFaculty: true, targetFaculty: true });
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id);
    await accept(s.ownerFac.auth, t.id);
    for (const u of [s.owner, s.requester, s.ownerFac]) {
      expect((await accept(u.auth, t.id)).status).toBe(403);
    }
    expect((await transferRow(t.id)).status).toBe('FACULTY2_ACCEPTED');
  });

  test('accepting an ACCEPTED or REJECTED transfer is 400; unknown id is 404', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id);
    const again = await accept(admin.auth, t.id);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('Invalid transfer status');

    const s2 = await scenario();
    const t2 = await requestFor(s2);
    await reject(s2.owner.auth, t2.id);
    expect((await accept(s2.owner.auth, t2.id)).status).toBe(400);
    expect((await bookingRow(s2.booking.id)).created_by).toBe(s2.owner.user.id);

    const nf = await accept(admin.auth, 987654321);
    expect(nf.status).toBe(404);
    expect(nf.body.error).toBe('Valid transfer request not found');
    expect((await reject(admin.auth, 987654321)).status).toBe(404);
  });

  test('accept/reject: 401 without token', async () => {
    expect((await request(app).patch('/api/transfers/1/accept')).status).toBe(401);
    expect((await request(app).patch('/api/transfers/1/reject')).status).toBe(401);
  });

  test.failing('[NEW-RTT-6] a non-numeric transfer id returns 400/404, not 500', async () => {
    const res = await accept(admin.auth, 'abc');
    expect([400, 404]).toContain(res.status);
  });
});

// ─── Rejections ──────────────────────────────────────────────────────────────
describe('transfer rejection', () => {
  test('owner rejects a PENDING request: REJECTED, booking untouched, audit row', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    const res = await reject(s.owner.auth, t.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Transfer rejected');
    expect((await transferRow(t.id)).status).toBe('REJECTED');
    expect(await bookingRow(s.booking.id)).toMatchObject({ status: 'ACTIVE', created_by: s.owner.user.id, purpose: 'Original purpose' });
    expect((await db.query("SELECT 1 FROM audit_logs WHERE action = 'REJECT_TRANSFER' AND entity_id = $1", [t.id])).rowCount).toBe(1);
  });

  test('owner faculty can reject at REP2_ACCEPTED; booking stays with owner', async () => {
    const s = await scenario({ ownerFaculty: true });
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id);
    expect((await reject(s.ownerFac.auth, t.id)).status).toBe(200);
    expect((await transferRow(t.id)).status).toBe('REJECTED');
    expect(await bookingRow(s.booking.id)).toMatchObject({ status: 'ACTIVE', created_by: s.owner.user.id });
  });

  test('target faculty and admin are allowed to reject', async () => {
    const s = await scenario({ targetFaculty: true });
    const t = await requestFor(s);
    expect((await reject(s.targetFac.auth, t.id)).status).toBe(200);
    const s2 = await scenario();
    const t2 = await requestFor(s2);
    expect((await reject(admin.auth, t2.id)).status).toBe(200);
    expect((await transferRow(t2.id)).status).toBe('REJECTED');
  });

  test('an unrelated rep or faculty cannot reject (403)', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    for (const u of [await createRep(), await createFaculty()]) {
      const res = await reject(u.auth, t.id);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Not authorized to reject this transfer');
    }
    expect((await transferRow(t.id)).status).toBe('PENDING');
  });

  // QUESTION: the requester has no way to withdraw their own request (reject → 403, no cancel endpoint).
  test('the requester cannot reject/withdraw their own request (current behaviour)', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    expect((await reject(s.requester.auth, t.id)).status).toBe(403);
  });

  test.failing('[BKG-06] rejecting mid-flow (after the booking was CANCELLED) restores the booking to its owner', async () => {
    const s = await scenario({ targetFaculty: true });
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id); // booking CANCELLED, FACULTY2_ACCEPTED
    expect((await reject(s.targetFac.auth, t.id)).status).toBe(200);
    expect(await bookingRow(s.booking.id)).toMatchObject({ status: 'ACTIVE', created_by: s.owner.user.id });
  });

  test.failing('[NEW-RTT-7] an already ACCEPTED transfer cannot be "rejected" afterwards (status would lie about the booking)', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id);
    const res = await reject(admin.auth, t.id);
    expect(res.status).toBe(400);
    expect((await transferRow(t.id)).status).toBe('ACCEPTED');
  });
});

// ─── BKG-06 state machine bugs ───────────────────────────────────────────────
describe('BKG-06 transfer state machine', () => {
  test.failing('[BKG-06] slot re-booked while CANCELLED mid-flow: final approval returns 409 and leaves the new booking intact (currently 500, transfer stuck)', async () => {
    const s = await scenario({ targetFaculty: true });
    const t = await requestFor(s);
    await accept(s.owner.auth, t.id); // original booking now CANCELLED
    const intruder = await createRep();
    const nb = await request(app).post('/api/bookings').set('Authorization', intruder.auth)
      .send({ room_id: s.room.id, start_time: s.slot.start, end_time: s.slot.end, purpose: 'Grabbed the freed slot' });
    expect(nb.status).toBe(201);

    const res = await accept(s.targetFac.auth, t.id);
    expect(res.status).toBe(409);
    expect((await bookingRow(nb.body.id)).status).toBe('ACTIVE');
  });

  test.failing('[BKG-06] two transfers on the same booking cannot both complete', async () => {
    const s = await scenario({ targetFaculty: true });
    const tA = await requestFor(s);
    const reqB = await createRep();
    const facB = await createFaculty();
    const tB = (await post(reqB.auth, { booking_id: s.booking.id, target_faculty_id: facB.faculty.id, new_purpose: 'B' })).body.transfer;

    await accept(s.owner.auth, tA.id);
    await accept(s.owner.auth, tB.id); // currently also 200 → both FACULTY2_ACCEPTED
    await accept(s.targetFac.auth, tA.id);
    await accept(facB.auth, tB.id);

    const { rows } = await db.query("SELECT id FROM booking_transfers WHERE booking_id = $1 AND status = 'ACCEPTED'", [s.booking.id]);
    expect(rows).toHaveLength(1);
  });

  test.failing('[BKG-06] accepting a transfer does not resurrect a booking the owner has since cancelled', async () => {
    const s = await scenario();
    const t = await requestFor(s);
    const cancel = await request(app).patch(`/api/bookings/${s.booking.id}/cancel`).set('Authorization', s.owner.auth);
    expect(cancel.status).toBe(200);
    expect((await bookingRow(s.booking.id)).status).toBe('CANCELLED');

    const res = await accept(s.owner.auth, t.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await bookingRow(s.booking.id)).status).toBe('CANCELLED');
  });

  test.failing('[BKG-06] a booking that has already ended cannot be transferred (accept refused)', async () => {
    const owner = await createRep();
    const requester = await createRep();
    const room = await createRoom();
    const p = pastSlot(30);
    const b = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: p.start, end_time: p.end });
    // insert the transfer directly so this test is independent of request-time validation
    const { rows: [t] } = await db.query(
      'INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose) VALUES ($1,$2,$3,$4) RETURNING id',
      [b.id, requester.user.id, owner.user.id, 'late'],
    );
    const res = await accept(owner.auth, t.id);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await bookingRow(b.id)).created_by).toBe(owner.user.id);
  });
});

// ─── Listing ─────────────────────────────────────────────────────────────────
describe('GET /api/transfers/incoming and /outgoing', () => {
  test('401 without token', async () => {
    expect((await request(app).get('/api/transfers/incoming')).status).toBe(401);
    expect((await request(app).get('/api/transfers/outgoing')).status).toBe(401);
  });

  test('incoming is scoped to the owner, then owner faculty at REP2_ACCEPTED, then target faculty at FACULTY2_ACCEPTED', async () => {
    const s = await scenario({ ownerFaculty: true, targetFaculty: true });
    const t = await requestFor(s);
    const stranger = await createRep();
    const ids = async (u) => (await incoming(u.auth)).body.map((r) => r.id);

    const ownerView = (await incoming(s.owner.auth)).body;
    expect(ownerView).toEqual([expect.objectContaining({
      id: t.id, status: 'PENDING', room_name: s.room.name, requester_name: s.requester.user.name,
      requestee_name: s.owner.user.name, booking_status: 'ACTIVE', owner_faculty_id: s.ownerFac.faculty.id,
    })]);
    expect(await ids(s.ownerFac)).toEqual([]);
    expect(await ids(s.targetFac)).toEqual([]);
    expect(await ids(stranger)).toEqual([]);
    expect(await ids(s.requester)).toEqual([]);

    await accept(s.owner.auth, t.id);
    expect(await ids(s.ownerFac)).toEqual([t.id]);
    expect(await ids(s.targetFac)).toEqual([]);

    await accept(s.ownerFac.auth, t.id);
    expect(await ids(s.ownerFac)).toEqual([]);
    expect(await ids(s.targetFac)).toEqual([t.id]);
    expect(await ids(s.owner)).toEqual([t.id]); // owner keeps seeing it (by stored owner_id)

    await accept(s.targetFac.auth, t.id);
    expect(await ids(s.targetFac)).toEqual([]);
    const final = (await incoming(s.owner.auth)).body;
    expect(final).toEqual([expect.objectContaining({ id: t.id, status: 'ACCEPTED' })]);
  });

  test('outgoing lists only the caller\'s requests with owner name, newest first', async () => {
    const s1 = await scenario();
    const s2 = await scenario();
    const me = s1.requester;
    const t1 = await requestFor(s1);
    const t2 = (await post(me.auth, { booking_id: s2.booking.id, new_purpose: 'second' })).body.transfer;
    await requestFor(s2); // s2.requester's own request – must not appear for `me`

    const res = await outgoing(me.auth);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.id)).toEqual([t2.id, t1.id]);
    expect(res.body[1]).toMatchObject({ room_name: s1.room.name, owner_name: s1.owner.user.name, status: 'PENDING', booking_status: 'ACTIVE' });
    expect((await outgoing(s1.owner.auth)).body).toEqual([]);
  });
});

// BKG-02: concurrent booking requests for the same room/time. The exclusion constraints of migration
// v26 (bookings_no_room_overlap / bookings_no_person_overlap) make the losers of a race 409s.
// Requests come from FACULTY accounts (their bookings are ACTIVE immediately, so they compete for the
// room) unless a test is about a student's PENDING requests.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createRep, createFaculty, createRoom, futureSlot, approverId, closeDb } from '../../test/helpers/factories.js';
import { ist, plusHours } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const N = 8;
const ROUNDS = 3;

const fire = (reqs) => Promise.all(reqs.map(({ auth, body }) =>
  request(app).post('/api/bookings').set('Authorization', auth).send(body)));

/**
 * Exactly one winner; every loser is refused. Losers should all be 409 — but two inserts that hit an
 * exclusion constraint at the same moment can deadlock; inTransaction retries and reports 409
 * (NEW-P4-7, also asserted deterministically in __tests__/unit/bookingRules.test.js).
 */
function expectOneWinner(res, conflictType) {
  const statuses = res.map((r) => r.status);
  expect(statuses.filter((s) => s === 201)).toHaveLength(1);
  // Deadlocks are retried and reported as 409 (NEW-P4-7 fixed), so losers never get a 500.
  expect(statuses.filter((s) => s !== 201).every((s) => s === 409)).toBe(true);
  // A loser that shares its start time with the winner trips a legacy unique index instead and gets a
  // generic 409 without a conflict body (NEW-P4-8).
  for (const r of res.filter((x) => x.status === 409 && x.body.conflict)) expect(r.body.conflict).toEqual({ type: conflictType });
}

const activeIn = async (roomId) =>
  (await db.query(`SELECT * FROM bookings WHERE room_id = $1 AND status = 'ACTIVE'`, [roomId])).rows;

/**
 * N distinct, on-the-hour, 1–4 h intervals starting at `hour` that all overlap each other
 * (each contains [hour+3, hour+4)): (h,h+4) (h+1,h+4) (h+1,h+5) (h+2,h+4) (h+2,h+5) (h+2,h+6) (h+3,h+4) (h+3,h+5)
 */
const overlapping = (dateKey, hour) => {
  const out = [];
  for (let s = 0; s < 4; s++) for (let e = 4; e <= s + 4; e++) out.push({ start_time: ist(dateKey, hour + s), end_time: ist(dateKey, hour + e) });
  return out.slice(0, N);
};

async function sameStartRound(hour) {
  const room = await createRoom();
  const slot = futureSlot({ hour });
  const facs = await Promise.all(Array.from({ length: N }, () => createFaculty()));
  const res = await fire(facs.map((r) => ({
    auth: r.auth, body: { room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'race' },
  })));
  return { statuses: res.map((r) => r.status), active: await activeIn(room.id) };
}

async function overlapRound(dateKey, hour) {
  // All overlap, all have distinct start/end, so only the exclusion constraint (not a unique index) catches them.
  const room = await createRoom();
  const facs = await Promise.all(Array.from({ length: N }, () => createFaculty()));
  const times = overlapping(dateKey, hour);
  const res = await fire(facs.map((r, i) => ({ auth: r.auth, body: { room_id: room.id, ...times[i], purpose: 'race' } })));
  return { res, active: await activeIn(room.id) };
}

describe('BKG-02 concurrency', () => {
  test('the overlap fixture really is pairwise-overlapping, distinct and legal', () => {
    const t = overlapping('2030-01-07', 8);
    expect(new Set(t.map((x) => x.start_time + x.end_time)).size).toBe(N);
    for (const a of t) {
      const hours = (new Date(a.end_time) - new Date(a.start_time)) / 3600_000;
      expect(hours).toBeGreaterThanOrEqual(1);
      expect(hours).toBeLessThanOrEqual(4);
      for (const b of t) expect(a.start_time < b.end_time && b.start_time < a.end_time).toBe(true);
    }
  });

  test('sequential sanity: second identical request gets 409, not 500', async () => {
    const room = await createRoom();
    const slot = futureSlot({ hour: 9 });
    const b = { room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'seq' };
    const a = await request(app).post('/api/bookings').set('Authorization', (await createFaculty()).auth).send(b);
    const c = await request(app).post('/api/bookings').set('Authorization', (await createFaculty()).auth).send(b);
    expect([a.status, c.status]).toEqual([201, 409]);
    expect(c.body.conflict).toEqual({ type: 'room_booked' });
  });

  test('same room + same start in parallel: never more than one ACTIVE booking', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { statuses, active } = await sameStartRound(10 + i);
      expect(active).toHaveLength(1);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    }
  });

  // Same start: losers hit the exclusion constraint (legacy unique indexes dropped in v28, NEW-P4-8).
  test('[BKG-02] same room + same start in parallel: every loser gets 409 (not 500)', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { statuses } = await sameStartRound(13 + i);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(N - 1);
    }
  });

  test('[BKG-02] overlapping intervals with different starts in parallel: exactly one ACTIVE survives, losers refused', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { dateKey } = futureSlot({ hour: 8, skip: i });
      const { res, active } = await overlapRound(dateKey, 8 + (i % 2) * 4);
      expect(active).toHaveLength(1);
      expectOneWinner(res, 'room_booked');
    }
  });

  test('[BKG-02] same user, N rooms, overlapping times in parallel: user is not double-booked (FACULTY, ACTIVE)', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const fac = await createFaculty();
      const rooms = await Promise.all(Array.from({ length: N }, () => createRoom()));
      const { dateKey } = futureSlot({ hour: 8, skip: i });
      const times = overlapping(dateKey, 8);
      const res = await fire(rooms.map((room, k) => ({ auth: fac.auth, body: { room_id: room.id, ...times[k], purpose: 'race' } })));
      const { rows } = await db.query(`SELECT * FROM bookings WHERE created_by = $1 AND status = 'ACTIVE'`, [fac.user.id]);
      expect(rows).toHaveLength(1);
      expectOneWinner(res, 'person_busy');
    }
  });

  test('[BKG-09] same student, N rooms, overlapping PENDING requests in parallel: one request survives, losers 409', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const rep = await createRep();
      const facultyId = await approverId();
      const rooms = await Promise.all(Array.from({ length: N }, () => createRoom()));
      const { dateKey } = futureSlot({ hour: 8, skip: i });
      const times = overlapping(dateKey, 12);
      const res = await fire(rooms.map((room, k) => ({
        auth: rep.auth, body: { room_id: room.id, ...times[k], purpose: 'race', faculty_id: facultyId },
      })));
      const { rows } = await db.query(`SELECT * FROM bookings WHERE created_by = $1 AND status IN ('ACTIVE','PENDING')`, [rep.user.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('PENDING');
      expectOneWinner(res, 'person_busy');
    }
  });

  test('10:00–12:00 and 11:00–12:00 sent sequentially: second is rejected', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 10 });
    const a = await request(app).post('/api/bookings').set('Authorization', (await createFaculty()).auth)
      .send({ room_id: room.id, start_time: ist(dateKey, 10), end_time: ist(dateKey, 12), purpose: 'a' });
    const b = await request(app).post('/api/bookings').set('Authorization', (await createFaculty()).auth)
      .send({ room_id: room.id, start_time: ist(dateKey, 11), end_time: plusHours(ist(dateKey, 11)), purpose: 'b' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(409);
  });
});

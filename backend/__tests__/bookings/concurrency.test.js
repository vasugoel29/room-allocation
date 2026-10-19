// BKG-02: concurrent booking requests for the same room/time.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createRep, createRoom, futureSlot, closeDb } from '../../test/helpers/factories.js';
import { ist, plusHours } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const N = 8;
const ROUNDS = 3;

const fire = (reqs) => Promise.all(reqs.map(({ auth, body }) =>
  request(app).post('/api/bookings').set('Authorization', auth).send(body)));

const activeIn = async (roomId) =>
  (await db.query(`SELECT * FROM bookings WHERE room_id = $1 AND status = 'ACTIVE'`, [roomId])).rows;

async function sameStartRound(hour) {
  const room = await createRoom();
  const slot = futureSlot({ hour });
  const reps = await Promise.all(Array.from({ length: N }, () => createRep()));
  const res = await fire(reps.map((r) => ({
    auth: r.auth, body: { room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'race' },
  })));
  return { statuses: res.map((r) => r.status), active: await activeIn(room.id) };
}

async function overlapRound(hour) {
  // 10:00–12:00, 10:10–12:00, 10:20–12:00 ... : all overlap, all have distinct start_time,
  // so the (room_id, start_time) partial unique index cannot catch them.
  const room = await createRoom();
  const { dateKey } = futureSlot({ hour });
  const reps = await Promise.all(Array.from({ length: N }, () => createRep()));
  const res = await fire(reps.map((r, i) => ({
    auth: r.auth,
    body: { room_id: room.id, start_time: ist(dateKey, hour, i * 5), end_time: ist(dateKey, hour + 2), purpose: 'race' },
  })));
  return { statuses: res.map((r) => r.status), active: await activeIn(room.id) };
}

describe('BKG-02 concurrency', () => {
  test('sequential sanity: second identical request gets 409, not 500', async () => {
    const room = await createRoom();
    const slot = futureSlot({ hour: 9 });
    const b = { room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'seq' };
    const a = await request(app).post('/api/bookings').set('Authorization', (await createRep()).auth).send(b);
    const c = await request(app).post('/api/bookings').set('Authorization', (await createRep()).auth).send(b);
    expect([a.status, c.status]).toEqual([201, 409]);
  });

  test('same room + same start in parallel: never more than one ACTIVE booking (unique index holds)', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { statuses, active } = await sameStartRound(10 + i);
      expect(active).toHaveLength(1);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    }
  });

  test('[BKG-02] same room + same start in parallel: every loser gets 409 (not 500)', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { statuses } = await sameStartRound(13 + i);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(N - 1);
    }
  });

  test.failing('[BKG-02] overlapping intervals with different starts in parallel: exactly one ACTIVE survives, losers 409', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const { statuses, active } = await overlapRound(8 + i * 3);
      expect(active).toHaveLength(1);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(N - 1);
    }
  });

  test.failing('[BKG-02] same user, two rooms, overlapping times in parallel: user is not double-booked', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const rep = await createRep();
      const rooms = await Promise.all(Array.from({ length: N }, () => createRoom()));
      const { dateKey } = futureSlot({ hour: 9 + i * 3 });
      await fire(rooms.map((room, k) => ({
        auth: rep.auth,
        body: { room_id: room.id, start_time: ist(dateKey, 9 + i * 3, k * 5), end_time: ist(dateKey, 11 + i * 3), purpose: 'race' },
      })));
      const { rows } = await db.query(`SELECT * FROM bookings WHERE created_by = $1 AND status = 'ACTIVE'`, [rep.user.id]);
      expect(rows).toHaveLength(1);
    }
  });

  test('10:00–12:00 and 11:00–12:00 sent sequentially: second is rejected', async () => {
    const room = await createRoom();
    const { dateKey } = futureSlot({ hour: 10 });
    const a = await request(app).post('/api/bookings').set('Authorization', (await createRep()).auth)
      .send({ room_id: room.id, start_time: ist(dateKey, 10), end_time: ist(dateKey, 12), purpose: 'a' });
    const b = await request(app).post('/api/bookings').set('Authorization', (await createRep()).auth)
      .send({ room_id: room.id, start_time: ist(dateKey, 11), end_time: plusHours(ist(dateKey, 11)), purpose: 'b' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(409);
  });
});

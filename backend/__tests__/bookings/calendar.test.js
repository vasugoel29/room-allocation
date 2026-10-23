import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  createAdmin, createRep, createFaculty, createViewer, createRoom, insertBooking, farFutureSlot, closeDb,
} from '../../test/helpers/factories.js';
import { ist } from '../../test/helpers/bookings.js';

afterAll(closeDb);

const get = (auth, path, query = {}) => {
  const r = request(app).get(path).query(query);
  if (auth) r.set('Authorization', auth);
  return r;
};

const nextDay = (key, n = 1) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

let owner; let other; let fac; let room; let day; let b;

beforeAll(async () => {
  owner = await createRep({ branch: 'IT', section: 2, semester: 5 });
  other = await createRep();
  fac = await createFaculty();
  room = await createRoom();
  day = farFutureSlot(20).dateKey;
  const at = (dateKey, hour, extra = {}) => insertBooking({
    room_id: room.id, created_by: owner.user.id, start_time: ist(dateKey, hour), purpose: 'secret plans', ...extra,
  });
  b = {
    active: await at(day, 9),
    pending: await at(day, 10, { status: 'PENDING', faculty_id: fac.faculty.id }),
    cancelled: await at(day, 11, { status: 'CANCELLED' }),
    // 23:00–00:00 IST still belongs to `day`, 00:00 IST the next day belongs to the next day.
    lateNight: await at(day, 23),
    nextDay: await at(nextDay(day), 0),
  };
});

const ids = (res) => res.body.data.filter((x) => x.room_id === room.id).map((x) => x.id);

describe('GET /api/bookings/calendar', () => {
  test('no token → 401', async () => {
    expect((await get(null, '/api/bookings/calendar', { from: day, to: day })).status).toBe(401);
  });

  test('[PERF-01] returns ACTIVE and PENDING bookings of the IST window only, in start order', async () => {
    const res = await get(other.auth, '/api/bookings/calendar', { from: day, to: day });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([b.active.id, b.pending.id, b.lateNight.id]);
    expect(res.body.meta).toEqual({ from: day, to: day });

    const two = await get(other.auth, '/api/bookings/calendar', { from: day, to: nextDay(day) });
    expect(ids(two)).toEqual([b.active.id, b.pending.id, b.lateNight.id, b.nextDay.id]);
  });

  test('the calendar is the limited view for everyone but managers; own/supervised rows come in full from /mine', async () => {
    for (const who of [other, owner, fac]) {
      const row = (await get(who.auth, '/api/bookings/calendar', { from: day, to: day })).body.data
        .find((x) => x.id === b.pending.id);
      expect(row).toMatchObject({ visibility: 'limited', user_name: owner.user.name, branch: 'IT', section: 2 });
      expect(row).not.toHaveProperty('purpose');
      expect(row).not.toHaveProperty('faculty_id');
    }
    for (const who of [owner, fac]) {
      const mine = (await get(who.auth, '/api/bookings/mine')).body.data.find((x) => x.id === b.pending.id);
      expect(mine).toMatchObject({ visibility: 'full', purpose: 'secret plans' });
    }
    const admin = await createAdmin();
    const asAdmin = (await get(admin.auth, '/api/bookings/calendar', { from: day, to: day })).body.data
      .find((x) => x.id === b.pending.id);
    expect(asAdmin).toMatchObject({ visibility: 'full', purpose: 'secret plans' });
  });

  test('can_request_transfer: only on upcoming ACTIVE rows, only for users allowed to transfer', async () => {
    const rows = (await get(other.auth, '/api/bookings/calendar', { from: day, to: day })).body.data;
    expect(rows.find((x) => x.id === b.active.id).can_request_transfer).toBe(true);
    expect(rows.find((x) => x.id === b.pending.id).can_request_transfer).toBe(false);
    const viewer = await createViewer();
    const asViewer = (await get(viewer.auth, '/api/bookings/calendar', { from: day, to: day })).body.data;
    expect(asViewer.find((x) => x.id === b.active.id).can_request_transfer).toBe(false);
  });

  test('[PERF-01] with the shared cache on, a successful write is visible on the very next read', async () => {
    process.env.SHARED_CACHE_MS = '60000';
    try {
      const first = await get(other.auth, '/api/bookings/calendar', { from: day, to: day });
      expect(ids(first)).not.toContain(b.cancelled.id);
      // A direct DB change (bypassing the API) is hidden by the cache…
      await db.query(`UPDATE bookings SET status = 'ACTIVE' WHERE id = $1`, [b.cancelled.id]);
      expect(ids(await get(other.auth, '/api/bookings/calendar', { from: day, to: day }))).not.toContain(b.cancelled.id);
      const admin = await createAdmin();
      expect((await request(app).patch(`/api/bookings/${b.lateNight.id}/cancel`).set('Authorization', admin.auth)).status).toBe(200);
      const after = ids(await get(other.auth, '/api/bookings/calendar', { from: day, to: day }));
      expect(after).toContain(b.cancelled.id);
      expect(after).not.toContain(b.lateNight.id);
    } finally {
      delete process.env.SHARED_CACHE_MS;
      await db.query(`UPDATE bookings SET status = 'CANCELLED' WHERE id = $1`, [b.cancelled.id]);
      await db.query(`UPDATE bookings SET status = 'ACTIVE' WHERE id = $1`, [b.lateNight.id]);
    }
  });

  test('a window of 31 days is allowed', async () => {
    expect((await get(other.auth, '/api/bookings/calendar', { from: day, to: nextDay(day, 30) })).status).toBe(200);
  });

  test.each([
    ['missing to', { from: '2030-01-07' }],
    ['not a date', { from: 'today', to: '2030-01-07' }],
    ['impossible date', { from: '2030-02-30', to: '2030-03-02' }],
    ['to before from', { from: '2030-01-08', to: '2030-01-07' }],
    ['32 days', { from: '2030-01-01', to: '2030-02-01' }],
  ])('%s → 400', async (_n, query) => {
    const res = await get(other.auth, '/api/bookings/calendar', query);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /api/bookings/mine', () => {
  test('the owner gets all their bookings, any status, latest start first', async () => {
    const res = await get(owner.auth, '/api/bookings/mine');
    expect(res.status).toBe(200);
    expect(res.body.data.map((x) => x.id)).toEqual(
      [b.nextDay.id, b.lateNight.id, b.cancelled.id, b.pending.id, b.active.id],
    );
    expect(res.body.data.every((x) => x.visibility === 'full')).toBe(true);
  });

  test('a faculty member gets the bookings they supervise; an unrelated user gets none of them', async () => {
    expect((await get(fac.auth, '/api/bookings/mine')).body.data.map((x) => x.id)).toEqual([b.pending.id]);
    expect((await get(other.auth, '/api/bookings/mine')).body.data).toEqual([]);
  });

  test('limit is honoured and capped', async () => {
    expect((await get(owner.auth, '/api/bookings/mine', { limit: 2 })).body.data).toHaveLength(2);
    const admin = await createAdmin();
    expect((await get(admin.auth, '/api/bookings/mine', { limit: 100000 })).status).toBe(200);
  });

  test('no token → 401', async () => {
    expect((await get(null, '/api/bookings/mine')).status).toBe(401);
  });
});

describe('calendar response encoding', () => {
  test('gzip when the client accepts it (pre-compressed, Vary set); plain JSON otherwise', async () => {
    const zipped = await request(app).get('/api/bookings/calendar').query({ from: day, to: day })
      .set('Authorization', other.auth).set('Accept-Encoding', 'gzip');
    expect(zipped.status).toBe(200);
    expect(zipped.headers['content-encoding']).toBe('gzip');
    expect(zipped.headers.vary).toMatch(/Accept-Encoding/i);
    expect(ids(zipped)).toEqual([b.active.id, b.pending.id, b.lateNight.id]); // supertest inflates it

    const plain = await request(app).get('/api/bookings/calendar').query({ from: day, to: day })
      .set('Authorization', other.auth).set('Accept-Encoding', 'identity');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(ids(plain)).toEqual([b.active.id, b.pending.id, b.lateNight.id]);
  });
});

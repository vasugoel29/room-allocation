// GET /api/admin/analytics. Other files in this DB also create bookings, so assertions are made on
// deltas between two snapshots taken around this file's own inserts (tests in a file run serially).
import request from 'supertest';
import app from '../../src/server.js';
import { createAdmin, createUser, createRoom, insertBooking, closeDb } from '../../test/helpers/factories.js';
import { istDateTimeToUtc, getIstParts } from '../../src/utils/timezone.js';

let admin;
let booker;
beforeAll(async () => {
  admin = await createAdmin();
  booker = await createUser({ role: 'STUDENT_REP' });
});
afterAll(closeDb);

const analytics = (query = {}) => request(app).get('/api/admin/analytics').query(query).set('Authorization', admin.auth);

/** IST calendar date `daysAgo` days before today. */
const istDateDaysAgo = (daysAgo) => getIstParts(Date.now() - daysAgo * 86400_000).date;

const hourCount = (body, h) => Number(body.peakHours.find((r) => Number(r.hour) === h)?.count || 0);

test('response shape', async () => {
  const res = await analytics();
  expect(res.status).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(['dailyTrends', 'peakHours', 'summary', 'topRooms']);
  expect(Object.keys(res.body.summary).sort()).toEqual(['booking_count', 'room_count', 'utilization_percent']);
  expect(res.body.summary).toMatchObject({ booking_count: expect.any(String), room_count: expect.any(String) });
  // null when there are no rooms at all (NULLIF guards the division), a number otherwise.
  const pct = res.body.summary.utilization_percent;
  expect(Number(res.body.summary.room_count) === 0 ? pct === null : typeof pct === 'number').toBe(true);
  expect(Array.isArray(res.body.topRooms)).toBe(true);
  expect(res.body.topRooms.length).toBeLessThanOrEqual(5);
});

test('numbers reflect seeded ACTIVE bookings only, within the day window', async () => {
  const before = await analytics();
  const room = await createRoom();

  // 40 ACTIVE bookings in the 03:00 IST hour spread over the last 2..21 days (2 per day: 03:00-03:30
  // and 03:30-04:00, so they don't overlap — the room/person exclusion constraints forbid that).
  const N = 40;
  const starts = [];
  for (let i = 0; i < N; i++) {
    const start = istDateTimeToUtc(istDateDaysAgo(2 + Math.floor(i / 2)), 3, (i % 2) * 30);
    starts.push(start);
    await insertBooking({ room_id: room.id, created_by: booker.user.id, start_time: start, end_time: new Date(new Date(start).getTime() + 30 * 60_000).toISOString() });
  }
  // Excluded: not ACTIVE, and outside the 30-day window. (The PENDING one is someone else's: a person
  // can't hold a PENDING request overlapping their own ACTIVE booking.)
  const other = await createUser({ role: 'STUDENT_REP' });
  await insertBooking({ room_id: room.id, created_by: booker.user.id, start_time: istDateTimeToUtc(istDateDaysAgo(3), 3), status: 'CANCELLED' });
  await insertBooking({ room_id: room.id, created_by: other.user.id, start_time: istDateTimeToUtc(istDateDaysAgo(3), 3), status: 'PENDING' });
  await insertBooking({ room_id: room.id, created_by: booker.user.id, start_time: istDateTimeToUtc(istDateDaysAgo(45), 3) });

  const after = await analytics();
  expect(after.status).toBe(200);
  const s0 = before.body.summary;
  const s1 = after.body.summary;
  expect(Number(s1.booking_count) - Number(s0.booking_count)).toBe(N);
  expect(Number(s1.room_count) - Number(s0.room_count)).toBe(1);
  // utilization = bookings / (rooms * 12h * days) * 100
  expect(s1.utilization_percent).toBeCloseTo((Number(s1.booking_count) / (Number(s1.room_count) * 12 * 30)) * 100, 6);

  expect(after.body.topRooms[0]).toEqual({ name: room.name, booking_count: String(N) });
  expect(hourCount(after.body, 3) - hourCount(before.body, 3)).toBe(N);

  // days=7 is "start_time >= now - 7 days": days 2..6 ago (10 bookings), plus day 7's 03:00/03:30
  // ones when the test runs before 03:30 IST.
  const weekStart = Date.now() - 7 * 86400_000;
  const week = await analytics({ days: 7 });
  const expected = starts.filter((t) => new Date(t).getTime() >= weekStart).length;
  expect([10, 11, 12]).toContain(expected);
  const weekRoom = week.body.topRooms.find((r) => r.name === room.name);
  expect(weekRoom).toEqual({ name: room.name, booking_count: String(expected) });
});

// Decision 2026-10-20: "last N days" runs from N days ago up to now; future bookings don't count.
test('future ACTIVE bookings are not counted in the "last N days" totals', async () => {
  const before = await analytics({ days: 1 });
  const room = await createRoom();
  await insertBooking({ room_id: room.id, created_by: booker.user.id, start_time: new Date(Date.now() + 200 * 86400_000).toISOString() });
  const after = await analytics({ days: 1 });
  expect(Number(after.body.summary.booking_count) - Number(before.body.summary.booking_count)).toBe(0);
  expect(after.body.topRooms.map((r) => r.name)).not.toContain(room.name);
});

// dailyTrends uses DATE_TRUNC('day', start_time) in the DB session time zone (UTC), while
// peakHours explicitly converts to Asia/Kolkata. A booking at 02:00 IST lands on the previous day.
test('[NEW-admin-4] dailyTrends buckets bookings by IST calendar day', async () => {
  const day = istDateDaysAgo(5);
  const before = await analytics();
  const room = await createRoom();
  await insertBooking({ room_id: room.id, created_by: booker.user.id, start_time: istDateTimeToUtc(day, 2) });
  const after = await analytics();

  const countFor = (body, istDay) => body.dailyTrends
    .filter((t) => getIstParts(t.date).date === istDay)
    .reduce((n, t) => n + Number(t.count), 0);
  expect(countFor(after.body, day) - countFor(before.body, day)).toBe(1);
});

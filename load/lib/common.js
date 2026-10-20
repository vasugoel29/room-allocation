import http from 'k6/http';
import { check, group } from 'k6';
import { SharedArray } from 'k6/data';

export const BASE = __ENV.BASE_URL || 'http://localhost:4200/api';

const raw = () => JSON.parse(open('../.data/tokens.json'));
export const students = new SharedArray('students', () => raw().students);
export const reps = new SharedArray('reps', () => raw().reps);
export const faculty = new SharedArray('faculty', () => raw().faculty);
export const admins = new SharedArray('admins', () => raw().admins);
export const rooms = new SharedArray('rooms', () => raw().rooms);

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Browsers always accept gzip; so does the load test, so compression cost is measured too.
export const auth = (token) => ({ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' } });

const ok = (name) => ({ [`${name} ok`]: (r) => r.status >= 200 && r.status < 300 });

const IST_MS = 5.5 * 3600 * 1000;
const dayKey = (offset) => new Date(Date.now() + IST_MS + offset * 86400000).toISOString().slice(0, 10);
const istWeekday = () => new Date(Date.now() + IST_MS).getUTCDay() || 7;
// AppContext loads this IST week and next (Monday..Sunday+7).
const calendarFrom = () => dayKey(1 - istWeekday());
const calendarTo = () => dayKey(14 - istWeekday());

/** What AppContext fires when any logged-in user opens the app. */
export function appLoad(user, role) {
  return group('app load', () => {
    const p = auth(user.token);
    const reqs = [
      ['GET', `${BASE}/health`, null, { ...p, tags: { name: 'health' } }],
      ['GET', `${BASE}/bookings/calendar?from=${calendarFrom()}&to=${calendarTo()}`, null, { ...p, tags: { name: 'calendar' } }],
      ['GET', `${BASE}/bookings/mine`, null, { ...p, tags: { name: 'bookings_mine' } }],
      ['GET', `${BASE}/availability`, null, { ...p, tags: { name: 'availability' } }],

      ['GET', `${BASE}/rooms?building=5th%20Block`, null, { ...p, tags: { name: 'rooms' } }],
      role === 'FACULTY'
        ? ['GET', `${BASE}/timetable/faculty`, null, { ...p, tags: { name: 'timetable_faculty' } }]
        : ['GET', `${BASE}/timetable`, null, { ...p, tags: { name: 'timetable' } }],
    ];
    // Like the app, only people who book or review load the faculty list and transfers.
    if (role !== 'VIEWER') {
      reqs.push(
        ['GET', `${BASE}/auth/faculties`, null, { ...p, tags: { name: 'faculties' } }],
        ['GET', `${BASE}/transfers/incoming`, null, { ...p, tags: { name: 'transfers_in' } }],
        ['GET', `${BASE}/transfers/outgoing`, null, { ...p, tags: { name: 'transfers_out' } }],
      );
    }
    const res = http.batch(reqs);
    res.forEach((r, i) => check(r, ok(reqs[i][3].tags.name)));
    return res;
  });
}

const IST = 5.5 * 3600 * 1000;
/** A future weekday slot (IST) `minDays`..6 days ahead at a random 08–17h hour. */
export function randomFutureSlot(minDays = 1) {
  for (;;) {
    const days = minDays + Math.floor(Math.random() * (7 - minDays));
    const key = new Date(Date.now() + IST + days * 86400000).toISOString().slice(0, 10);
    const [y, m, d] = key.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const hour = 8 + Math.floor(Math.random() * 10);
    const start = new Date(Date.UTC(y, m - 1, d, hour) - IST);
    return { start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString() };
  }
}

/** Rep books a random free-ish slot then (sometimes) cancels it. 201 and 409 are both valid outcomes. */
export function bookAndMaybeCancel(rep, cancelRatio = 0.5) {
  return group('book', () => {
    const slot = randomFutureSlot();
    const room = pick(rooms);
    const r = http.post(`${BASE}/bookings`, JSON.stringify({ room_id: room.id, start_time: slot.start, end_time: slot.end, purpose: 'k6 load', faculty_id: pick(faculty).faculty_id }), {
      ...auth(rep.token),
      tags: { name: 'create_booking' },
    });
    check(r, { 'create booking 201/409': (x) => x.status === 201 || x.status === 409 });
    if (r.status === 201 && Math.random() < cancelRatio) {
      const id = r.json('id');
      const c = http.patch(`${BASE}/bookings/${id}/cancel`, null, { ...auth(rep.token), tags: { name: 'cancel_booking' } });
      check(c, ok('cancel_booking'));
    }
    return r;
  });
}

export const defaultThresholds = {
  http_req_failed: ['rate<0.01'],
  'http_req_duration{name:health}': ['p(95)<200'],
  'http_req_duration{name:calendar}': ['p(95)<500'],
  'http_req_duration{name:bookings_mine}': ['p(95)<500'],
  'http_req_duration{name:create_booking}': ['p(95)<1000'],
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
  checks: ['rate>0.99'],
};

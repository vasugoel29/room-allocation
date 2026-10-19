// Booking integrity under contention: many reps race for the same few room-slots at once.
// Correct behaviour: exactly one 201 per (room, slot) and everything else 409 — never 500,
// never two overlapping ACTIVE bookings (run.sh verifies the DB afterwards).
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { reps, rooms, BASE, auth } from '../lib/common.js';

const created = new Counter('bookings_created');
const conflicts = new Counter('bookings_conflict');
const serverErrors = new Counter('bookings_5xx');

const TARGETS = 5;
export const options = {
  scenarios: { race: { executor: 'shared-iterations', vus: 200, iterations: 1000, maxDuration: '2m' } },
  thresholds: { bookings_5xx: ['count==0'], [`bookings_created`]: [`count<=${TARGETS * 2}`] },
};

export function setup() {
  // Fixed targets: 5 rooms, a weekday 2–6 days out at 11:00 IST, plus an overlapping 10:00–12:00 variant.
  const IST = 5.5 * 3600 * 1000;
  let key;
  for (let d = 2; d < 9; d++) {
    key = new Date(Date.now() + IST + d * 86400000).toISOString().slice(0, 10);
    const [y, m, dd] = key.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
    if (dow !== 0 && dow !== 6 && d <= 6) break;
  }
  const [y, m, d] = key.split('-').map(Number);
  const at = (h) => new Date(Date.UTC(y, m - 1, d, h) - IST).toISOString();
  return { targets: rooms.slice(-TARGETS).map((r) => r.id), at11: at(11), at12: at(12), at10: at(10) };
}

export default function (t) {
  const rep = reps[(__VU * 7 + __ITER) % reps.length];
  const room = t.targets[__ITER % t.targets.length];
  // Half the racers ask for 11–12, half for the overlapping 10–12 (different start time).
  const body = __ITER % 2 === 0
    ? { room_id: room, start_time: t.at11, end_time: t.at12, purpose: 'race' }
    : { room_id: room, start_time: t.at10, end_time: t.at12, purpose: 'race-overlap' };
  const r = http.post(`${BASE}/bookings`, JSON.stringify(body), { ...auth(rep.token), tags: { name: 'race_booking' } });
  if (r.status === 201) created.add(1);
  else if (r.status === 409) conflicts.add(1);
  else if (r.status >= 500) serverErrors.add(1);
  check(r, { 'race: 201 or 409 only': (x) => x.status === 201 || x.status === 409 });
}

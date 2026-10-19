// Abuse guard: the leaky bucket must stop floods and password guessing, but must NOT
// affect a normal user while someone else is flooding.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { students, BASE, auth } from '../lib/common.js';

const floodLimited = new Counter('flood_429');
const bruteLimited = new Counter('bruteforce_429');
const bystanderLimited = new Counter('bystander_429');

export const options = {
  scenarios: {
    flood: { executor: 'constant-arrival-rate', exec: 'flood', rate: 200, timeUnit: '1s', duration: '20s', preAllocatedVUs: 50 },
    bruteforce: { executor: 'constant-arrival-rate', exec: 'bruteforce', rate: 20, timeUnit: '1s', duration: '20s', preAllocatedVUs: 10 },
    bystander: { executor: 'constant-vus', exec: 'bystander', vus: 5, duration: '20s' },
  },
  thresholds: { flood_429: ['count>0'], bruteforce_429: ['count>0'], bystander_429: ['count==0'] },
};

export function flood() {
  const r = http.get(`${BASE}/rooms`, { ...auth(students[0].token), tags: { name: 'flood' } });
  if (r.status === 429) floodLimited.add(1);
}

export function bruteforce() {
  const r = http.post(`${BASE}/auth/login`, JSON.stringify({ email: students[1].email, password: `guess${Math.random()}` }), {
    headers: { 'Content-Type': 'application/json' }, tags: { name: 'bruteforce' },
  });
  if (r.status === 429) bruteLimited.add(1);
}

export function bystander() {
  const u = students[10 + __VU];
  const r = http.get(`${BASE}/rooms`, { ...auth(u.token), tags: { name: 'bystander' } });
  if (r.status === 429) bystanderLimited.add(1);
  check(r, { 'bystander unaffected': (x) => x.status === 200 });
  sleep(1);
}

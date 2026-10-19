// Realistic peak: the 5-minute rush around a class change. Students mostly browse, reps book,
// faculty review, a few admins work. Think times model real users, not a benchmark loop.
import { sleep } from 'k6';
import http from 'k6/http';
import { check } from 'k6';
import { appLoad, bookAndMaybeCancel, students, reps, faculty, admins, pick, BASE, auth, defaultThresholds } from '../lib/common.js';

const PEAK = Number(__ENV.PEAK_STUDENTS || 400);

export const options = {
  scenarios: {
    students: { executor: 'ramping-vus', exec: 'student', startVUs: 0, stages: [{ duration: '1m', target: PEAK }, { duration: '3m', target: PEAK }, { duration: '30s', target: 0 }] },
    reps: { executor: 'ramping-vus', exec: 'rep', startVUs: 0, stages: [{ duration: '1m', target: Math.ceil(PEAK / 7) }, { duration: '3m', target: Math.ceil(PEAK / 7) }, { duration: '30s', target: 0 }] },
    faculty: { executor: 'constant-vus', exec: 'fac', vus: Math.ceil(PEAK / 20), duration: '4m30s' },
    admins: { executor: 'constant-vus', exec: 'admin', vus: 3, duration: '4m30s' },
  },
  thresholds: defaultThresholds,
};

export function student() {
  appLoad(pick(students), 'VIEWER');
  sleep(5 + Math.random() * 10);
}

export function rep() {
  const u = pick(reps);
  appLoad(u, 'STUDENT_REP');
  sleep(2 + Math.random() * 3);
  bookAndMaybeCancel(u, 0.3);
  sleep(5 + Math.random() * 10);
}

export function fac() {
  const u = pick(faculty);
  appLoad(u, 'FACULTY');
  check(http.get(`${BASE}/faculty/pending`, { ...auth(u.token), tags: { name: 'faculty_pending' } }), { 'faculty pending ok': (r) => r.status === 200 });
  sleep(10 + Math.random() * 10);
}

export function admin() {
  const u = pick(admins);
  const p = auth(u.token);
  check(http.get(`${BASE}/bookings/admin/all?page=1&limit=20`, { ...p, tags: { name: 'admin_bookings' } }), { 'admin bookings ok': (r) => r.status === 200 });
  check(http.get(`${BASE}/admin/analytics?days=30`, { ...p, tags: { name: 'admin_analytics' } }), { 'analytics ok': (r) => r.status === 200 });
  check(http.get(`${BASE}/admin/audit-logs?page=1`, { ...p, tags: { name: 'audit_logs' } }), { 'audit ok': (r) => r.status === 200 });
  sleep(5 + Math.random() * 5);
}

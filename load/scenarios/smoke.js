// 1 user per role for 1 minute: verifies every hot endpoint works before heavier runs.
import { sleep } from 'k6';
import { appLoad, bookAndMaybeCancel, students, reps, faculty, admins, pick } from '../lib/common.js';
import http from 'k6/http';
import { check } from 'k6';
import { BASE, auth } from '../lib/common.js';

export const options = {
  vus: 4,
  duration: '1m',
  thresholds: { checks: ['rate==1'], http_req_failed: ['rate<0.01'] },
};

export default function () {
  const roles = [['VIEWER', students], ['STUDENT_REP', reps], ['FACULTY', faculty], ['ADMIN', admins]];
  const [role, pool] = roles[(__VU - 1) % roles.length];
  const user = pick(pool);
  appLoad(user, role);
  if (role === 'STUDENT_REP') bookAndMaybeCancel(user, 1);
  if (role === 'FACULTY') check(http.get(`${BASE}/faculty/pending`, { ...auth(user.token), tags: { name: 'faculty_pending' } }), { 'faculty pending ok': (r) => r.status === 200 });
  if (role === 'ADMIN') {
    check(http.get(`${BASE}/admin/analytics?days=7`, { ...auth(user.token), tags: { name: 'admin_analytics' } }), { 'analytics ok': (r) => r.status === 200 });
    check(http.get(`${BASE}/bookings/admin/all?page=1&limit=20`, { ...auth(user.token), tags: { name: 'admin_bookings' } }), { 'admin bookings ok': (r) => r.status === 200 });
  }
  sleep(1);
}

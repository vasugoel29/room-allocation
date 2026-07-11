import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 }, // Ramp up to 10 VUs
    { duration: '15s', target: 30 }, // Ramp up to 30 VUs
    { duration: '5s', target: 0 },   // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests must be under 1.5s
    http_req_failed: ['rate<0.05'],    // Less than 5% error rate
  },
};

const BASE_URL = 'http://localhost:4000/api';

// Run once to setup and generate shared credentials
export function setup() {
  const email = 'load.test.student@nsut.ac.in';
  const password = 'password123';

  // 1. Attempt signup (ignore 400 conflict if already registered)
  http.post(`${BASE_URL}/auth/signup`, JSON.stringify({
    name: 'Load Test Student',
    email: email,
    password: password,
    role: 'STUDENT_REP',
    branch: 'CSE',
    year: 3,
    section: 1
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  // 2. Perform login
  const loginRes = http.post(`${BASE_URL}/auth/login`, JSON.stringify({
    email: email,
    password: password
  }), {
    headers: { 'Content-Type': 'application/json' }
  });

  let token = '';
  try {
    const body = JSON.parse(loginRes.body);
    token = body.token || '';
  } catch (e) {
    console.error('Failed to parse login response', e);
  }

  return { token };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    ...(data.token ? { 'Authorization': `Bearer ${data.token}` } : {})
  };

  // 1. Fetch available rooms
  const roomsRes = http.get(`${BASE_URL}/rooms?capacity=30&ac=true`, { headers });
  check(roomsRes, {
    'GET /rooms status is 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // 2. Fetch general availability overrides
  const availRes = http.get(`${BASE_URL}/availability`, { headers });
  check(availRes, {
    'GET /availability status is 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // 3. Simple health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'GET /health status is 200': (r) => r.status === 200,
  });

  sleep(1);
}

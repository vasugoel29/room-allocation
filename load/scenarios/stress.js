// Finds the knee: open-model arrival rate of full app loads climbing until latency/errors degrade.
// Thresholds are informational (no abort) — read the summary to see where p95 crosses 1s.
import { appLoad, students, pick } from '../lib/common.js';

export const options = {
  scenarios: {
    climb: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { duration: '1m', target: 20 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 150 },
        { duration: '1m', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: { http_req_failed: ['rate<0.05'], http_req_duration: ['p(95)<1000'] },
};

export default function () {
  appLoad(pick(students), 'VIEWER');
}

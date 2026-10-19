// Soak: moderate steady load for SOAK_DURATION (default 30m) to surface leaks
// (pool exhaustion, memory growth, cache growth). Watch /metrics or process RSS meanwhile.
import { sleep } from 'k6';
import { appLoad, bookAndMaybeCancel, students, reps, pick, defaultThresholds } from '../lib/common.js';

export const options = {
  scenarios: {
    browse: { executor: 'constant-vus', exec: 'browse', vus: 100, duration: __ENV.SOAK_DURATION || '30m' },
    book: { executor: 'constant-vus', exec: 'book', vus: 10, duration: __ENV.SOAK_DURATION || '30m' },
  },
  thresholds: defaultThresholds,
};
export function browse() { appLoad(pick(students), 'VIEWER'); sleep(5 + Math.random() * 10); }
export function book() { bookAndMaybeCancel(pick(reps), 0.8); sleep(5 + Math.random() * 5); }

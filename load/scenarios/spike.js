// Sudden spike (e.g. timetable change announced in a group chat): 0 -> SPIKE users in 10s.
import { sleep } from 'k6';
import { appLoad, students, pick } from '../lib/common.js';

const SPIKE = Number(__ENV.SPIKE_VUS || 800);
export const options = {
  stages: [{ duration: '10s', target: SPIKE }, { duration: '1m', target: SPIKE }, { duration: '10s', target: 0 }],
  thresholds: { http_req_failed: ['rate<0.02'], http_req_duration: ['p(95)<2000'] },
};

export default function () {
  appLoad(pick(students), 'VIEWER');
  sleep(3 + Math.random() * 5);
}

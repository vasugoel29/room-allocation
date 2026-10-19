import { test as base, expect } from '@playwright/test';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { E2E_DB_URL, API_URL } from './env.mjs';

export const PASSWORD = 'Password@123';
const HASH = bcrypt.hashSync(PASSWORD, 4);

let seq = 0;
const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Thin data-seeding helper bound to the e2e database. */
export class Seed {
  constructor(client) {
    this.db = client;
  }

  async user({ role = 'VIEWER', ...overrides } = {}) {
    const fields = {
      name: `E2E ${role.replace('_', ' ')} ${uid()}`,
      email: `e2e.${role.toLowerCase()}.${uid()}@nsut.ac.in`,
      password: HASH,
      role,
      is_approved: true,
      ...overrides,
    };
    const cols = Object.keys(fields);
    const { rows } = await this.db.query(
      `INSERT INTO users (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((c) => fields[c]),
    );
    return rows[0];
  }

  /** Rooms default to "5th Block" — the calendar's default building filter. */
  async room(overrides = {}) {
    const fields = {
      name: `E2E-${uid()}`.slice(0, 32),
      building: '5th Block',
      floor: 1,
      capacity: 60,
      type: 'Lecture Room',
      has_ac: true,
      has_projector: true,
      ...overrides,
    };
    const cols = Object.keys(fields);
    const { rows } = await this.db.query(
      `INSERT INTO rooms (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      cols.map((c) => fields[c]),
    );
    return rows[0];
  }

  async booking({ room_id, created_by, start_time, end_time, purpose = `E2E booking ${uid()}`, status = 'ACTIVE', faculty_id = null }) {
    end_time = end_time || new Date(new Date(start_time).getTime() + 3600_000).toISOString();
    const { rows } = await this.db.query(
      `INSERT INTO bookings (room_id, created_by, start_time, end_time, purpose, status, faculty_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [room_id, created_by, start_time, end_time, purpose, status, faculty_id],
    );
    return rows[0];
  }

  async one(sql, params) {
    const { rows } = await this.db.query(sql, params);
    return rows[0];
  }
}

/** IST helpers (the app is IST-only; tests run with timezoneId Asia/Kolkata). */
const IST_OFFSET_MS = 5.5 * 3600_000;
export function istDateKey(ms = Date.now()) {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}
export function istToUtc(dateKey, hour) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour) - IST_OFFSET_MS).toISOString();
}
/** Next weekday (Mon–Fri, IST) at `hour` that is at least `leadHours` ahead. */
export function nextWeekdaySlot(hour = 15, leadHours = 2) {
  for (let i = 0; i < 10; i++) {
    const key = istDateKey(Date.now() + i * 86400_000);
    const start = istToUtc(key, hour);
    const dow = new Date(`${key}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (new Date(start).getTime() < Date.now() + leadHours * 3600_000) continue;
    return { dateKey: key, start, end: new Date(new Date(start).getTime() + 3600_000).toISOString(), hour, dow };
  }
  throw new Error('no weekday slot');
}

export async function apiLogin(request, email, password = PASSWORD) {
  const res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  seed: async ({}, use) => {
    const client = new pg.Client({ connectionString: E2E_DB_URL });
    await client.connect();
    await use(new Seed(client));
    await client.end();
  },

  /** Log in through the API and inject the session the way Login.jsx stores it. */
  loginAs: async ({ page, request }, use) => {
    await use(async (user, path) => {
      const { token, user: u } = await apiLogin(request, user.email);
      await page.addInitScript(([t, json]) => {
        // Top frame only: Sentry creates a same-origin about:blank iframe (to grab a native fetch), and
        // re-running this there would silently log the user back in after a logout.
        if (window !== window.top) return;
        localStorage.setItem('token', t);
        localStorage.setItem('user', json);
      }, [token, JSON.stringify(u)]);
      if (path) await page.goto(path);
      return { token, user: u };
    });
  },
});

export { expect };
export { API_URL };

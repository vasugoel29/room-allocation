// OPS-02 regression: startup migrations (src/db.js runMigrations) run each migration in its own
// transaction under a Postgres advisory lock, so two instances booting against the same fresh
// database must both succeed without double-applying anything.
// Simulated with two child processes importing db.js against a throwaway database that this
// file creates and drops itself (roomdb_test_admin_mig). Bounded: each child is killed after 45s.
// Also covers migrations v25/v35 (passwords cleared, then legacy columns and tables dropped).
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import pg from 'pg';
import * as db from '../../src/db.js';
import { closeDb } from '../../test/helpers/factories.js';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIG_DB = 'roomdb_test_admin_mig';
const REF_DB = 'roomdb_test_admin_mig_ref';
const baseUrl = new URL(process.env.DATABASE_URL);
const urlFor = (name) => Object.assign(new URL(baseUrl), { pathname: `/${name}` }).toString();
const migUrl = urlFor(MIG_DB);
const refUrl = urlFor(REF_DB);
const adminUrl = Object.assign(new URL(baseUrl), { pathname: '/postgres' }).toString();

async function withClient(url, fn) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

const recreate = (name) => withClient(adminUrl, async (c) => {
  await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${name}"`);
});

/** Runs testDbConnection() in a fresh node process against the throwaway DB; resolves to its boolean result. */
function migrateInChild(url = migUrl) {
  const script = "import('./src/db.js').then(async (m) => { const ok = await m.testDbConnection(); await m.pool.end(); process.stdout.write('\\nRESULT=' + ok + '\\n'); })";
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const m = out.match(/RESULT=(true|false)/);
      const err = out.match(/"action":"Database connection failed","error":"([^"]*)"/);
      resolve({ code, ok: m ? m[1] === 'true' : null, error: err?.[1] ?? null });
    });
  });
}

let expectedSlots;
let expectedVersions;
const counts = (url) => withClient(url, async (c) => ({
  slots: Number((await c.query('SELECT count(*) FROM timetable_slots')).rows[0].count),
  versions: Number((await c.query('SELECT count(*) FROM schema_migrations')).rows[0].count),
}));
beforeAll(async () => {
  // Reference: one instance migrating a fresh database on its own. (The suite's shared DB can't be
  // used — other test files add timetable rows to it.)
  await recreate(REF_DB);
  await withClient(refUrl, async (c) => {
    await c.query(db.BASE_SCHEMA);
    // A pre-SSO account with a stored password hash (v25 must clear it on the way up).
    await c.query("INSERT INTO users (name, email, password, role) VALUES ('Legacy User', 'legacy.v25@nsut.ac.in', '$2b$04$legacyhashlegacyhashlegacyhashlegacyhashlegacyhash12', 'VIEWER')");
  });
  const ref = await migrateInChild(refUrl);
  if (!ref.ok) throw new Error(`reference migration failed: ${ref.error}`);
  ({ slots: expectedSlots, versions: expectedVersions } = await counts(refUrl));

  await recreate(MIG_DB);
  await withClient(migUrl, (c) => c.query(db.BASE_SCHEMA));
}, 60000);

afterAll(async () => {
  await withClient(adminUrl, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS "${MIG_DB}" WITH (FORCE)`);
    await c.query(`DROP DATABASE IF EXISTS "${REF_DB}" WITH (FORCE)`);
  });
  await closeDb();
}, 30000);

test('[OPS-02] two instances migrating a fresh database concurrently both succeed and end in the same state', async () => {
  expect(expectedSlots).toBe(0); // migrations seed no data
  const [a, b] = await Promise.all([migrateInChild(), migrateInChild()]);
  const { slots, versions } = await counts(migUrl);
  expect(versions).toBe(expectedVersions);
  expect(slots).toBe(expectedSlots);
  expect([a.ok, b.ok]).toEqual([true, true]);
}, 60000);

describe('migrations v25 + v35 (no passwords: cleared, then the columns dropped)', () => {
  test('are recorded in the suite database', async () => {
    const { rows } = await db.query('SELECT version FROM schema_migrations WHERE version IN (25, 35) ORDER BY version');
    expect(rows.map((r) => r.version)).toEqual([25, 35]);
  });

  test('a legacy account that had a password keeps its row; no password, reset or approval columns remain', async () => {
    await withClient(refUrl, async (c) => {
      expect((await c.query("SELECT name FROM users WHERE email = 'legacy.v25@nsut.ac.in'")).rows[0])
        .toEqual({ name: 'Legacy User' });
      const { rows } = await c.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'
            AND column_name IN ('password', 'password_reset_token', 'password_reset_expires', 'is_approved', 'department_id', 'branch_id', 'role')`,
      );
      expect(rows).toEqual([]);
      for (const t of ['departments', 'branches', 'promotion_requests', 'booking_history']) {
        expect((await c.query('SELECT to_regclass($1) AS t', [`public.${t}`])).rows[0].t).toBeNull();
      }
    });
  });

  test('re-running v25 onward on a migrated database is a no-op that succeeds', async () => {
    await withClient(refUrl, (c) => c.query('DELETE FROM schema_migrations WHERE version >= 25'));
    const run = await migrateInChild(refUrl);
    expect(run).toMatchObject({ ok: true, error: null });
    await withClient(refUrl, async (c) => {
      expect(Number((await c.query('SELECT count(*) FROM schema_migrations')).rows[0].count)).toBe(expectedVersions);
    });
  }, 60000);
});

describe('migration v26 (booking integrity: exclusion constraints)', () => {
  test('re-applying v26 to legacy overlapping rows cancels the newer ones (audited) and restores the constraints', async () => {
    const ids = await withClient(refUrl, async (c) => {
      // Simulate a pre-v26 database: no constraints, overlapping rows.
      for (const k of ['bookings_no_room_overlap', 'bookings_no_person_overlap', 'bookings_no_faculty_overlap', 'bookings_time_order']) {
        await c.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS ${k}`);
      }
      const { rows: [u1] } = await c.query("INSERT INTO users (name, email) VALUES ('V26 A', 'v26.a@nsut.ac.in') RETURNING id");
      const { rows: [u2] } = await c.query("INSERT INTO users (name, email) VALUES ('V26 B', 'v26.b@nsut.ac.in') RETURNING id");
      const { rows: [r1] } = await c.query("INSERT INTO rooms (name, building, floor, capacity, type) VALUES ('V26-R1', 'B', 1, 10, 'Lecture Room') RETURNING id");
      const { rows: [r2] } = await c.query("INSERT INTO rooms (name, building, floor, capacity, type) VALUES ('V26-R2', 'B', 1, 10, 'Lecture Room') RETURNING id");
      const ins = async (room, user, start, end, status = 'ACTIVE', ago = 10) => (await c.query(
        `INSERT INTO bookings (room_id, created_by, start_time, end_time, purpose, status, created_at)
         VALUES ($1, $2, $3, $4, 'legacy', $5, NOW() - ($6 || ' minutes')::interval) RETURNING id`, [room, user, start, end, status, ago])).rows[0].id;
      return {
        roomKeep: await ins(r1.id, u1.id, '2031-01-06T04:30:00Z', '2031-01-06T06:30:00Z', 'ACTIVE', 30),
        roomLose: await ins(r1.id, u2.id, '2031-01-06T05:30:00Z', '2031-01-06T06:30:00Z', 'ACTIVE', 20),
        personLose: await ins(r2.id, u1.id, '2031-01-06T05:00:00Z', '2031-01-06T06:00:00Z', 'PENDING', 10),
        cancelledOk: await ins(r1.id, u2.id, '2031-01-06T04:30:00Z', '2031-01-06T05:30:00Z', 'CANCELLED', 1),
      };
    });
    await withClient(refUrl, (c) => c.query('DELETE FROM schema_migrations WHERE version >= 26'));
    const run = await migrateInChild(refUrl);
    expect(run).toMatchObject({ ok: true, error: null });

    await withClient(refUrl, async (c) => {
      const status = async (id) => (await c.query('SELECT status FROM bookings WHERE id = $1', [id])).rows[0].status;
      expect(await status(ids.roomKeep)).toBe('ACTIVE');
      expect(await status(ids.roomLose)).toBe('CANCELLED');
      expect(await status(ids.personLose)).toBe('CANCELLED');
      expect(await status(ids.cancelledOk)).toBe('CANCELLED');
      const { rows: audit } = await c.query(
        `SELECT entity_id, details FROM audit_logs WHERE action = 'MIGRATION_CANCEL_OVERLAP' AND entity_id = ANY($1) ORDER BY entity_id`,
        [[ids.roomLose, ids.personLose]]);
      expect(audit.map((a) => [a.entity_id, a.details.rule])).toEqual([[ids.roomLose, 'room'], [ids.personLose, 'person']]);
      const { rows: cons } = await c.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'bookings'::regclass AND conname LIKE 'bookings_%' ORDER BY conname`);
      expect(cons.map((r) => r.conname)).toEqual(expect.arrayContaining(
        ['bookings_no_faculty_overlap', 'bookings_no_person_overlap', 'bookings_no_room_overlap', 'bookings_time_order']));
    });
  }, 60000);
});

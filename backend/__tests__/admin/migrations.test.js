// OPS-02 regression: startup migrations (src/db.js runMigrations) run each migration in its own
// transaction under a Postgres advisory lock, so two instances booting against the same fresh
// database must both succeed without double-applying anything.
// Simulated with two child processes importing db.js against a throwaway database that this
// file creates and drops itself (roomdb_test_admin_mig). Bounded: each child is killed after 45s.
// Also covers migration v25 (stored passwords / reset tokens cleared) on the reference database.
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
    await c.query(fs.readFileSync(path.join(backendDir, 'sql/schema_v2.sql'), 'utf8'));
    // A pre-SSO account with a stored password hash (v25 must clear it on the way up).
    await c.query("INSERT INTO users (name, email, password, role) VALUES ('Legacy User', 'legacy.v25@nsut.ac.in', '$2b$04$legacyhashlegacyhashlegacyhashlegacyhashlegacyhash12', 'VIEWER')");
  });
  const ref = await migrateInChild(refUrl);
  if (!ref.ok) throw new Error(`reference migration failed: ${ref.error}`);
  ({ slots: expectedSlots, versions: expectedVersions } = await counts(refUrl));

  await recreate(MIG_DB);
  await withClient(migUrl, (c) => c.query(fs.readFileSync(path.join(backendDir, 'sql/schema_v2.sql'), 'utf8')));
}, 60000);

afterAll(async () => {
  await withClient(adminUrl, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS "${MIG_DB}" WITH (FORCE)`);
    await c.query(`DROP DATABASE IF EXISTS "${REF_DB}" WITH (FORCE)`);
  });
  await closeDb();
}, 30000);

test('[OPS-02] two instances migrating a fresh database concurrently both succeed and seed timetable_slots once', async () => {
  expect(expectedSlots).toBeGreaterThan(0);
  const [a, b] = await Promise.all([migrateInChild(), migrateInChild()]);
  const { slots, versions } = await counts(migUrl);
  expect(versions).toBe(expectedVersions);
  expect(slots).toBe(expectedSlots);
  expect([a.ok, b.ok]).toEqual([true, true]);
}, 60000);

describe('migration v25 (Google SSO only: clear stored password hashes and reset tokens)', () => {
  const credentials = (c, email) => c.query(
    'SELECT name, role, password, password_reset_token, password_reset_expires FROM users WHERE email = $1', [email],
  ).then((r) => r.rows[0]);

  test('is recorded in the suite database', async () => {
    const { rows } = await db.query('SELECT version, name FROM schema_migrations WHERE version = 25');
    expect(rows).toEqual([{ version: 25, name: 'Google SSO only: clear stored password hashes and reset tokens' }]);
  });

  test('a legacy account that had a password before migrating ends with no password; the row is kept', async () => {
    const row = await withClient(refUrl, (c) => credentials(c, 'legacy.v25@nsut.ac.in'));
    expect(row).toEqual({ name: 'Legacy User', role: 'VIEWER', password: null, password_reset_token: null, password_reset_expires: null });
  });

  test('re-applying v25 clears a password hash and a pending reset token, and touches nothing else', async () => {
    const email = 'reset.v25@nsut.ac.in';
    await withClient(refUrl, async (c) => {
      await c.query(
        `INSERT INTO users (name, email, password, role, password_reset_token, password_reset_expires)
         VALUES ('Pending Reset', $1, '$2b$04$somehash', 'FACULTY', 'deadbeef', NOW() + interval '1 hour')`, [email]);
      // runMigrations applies everything above MAX(version), so dropping the v25 row re-runs it.
      await c.query('DELETE FROM schema_migrations WHERE version = 25');
    });
    const run = await migrateInChild(refUrl);
    expect(run).toMatchObject({ ok: true, error: null });
    await withClient(refUrl, async (c) => {
      expect(await credentials(c, email)).toEqual({ name: 'Pending Reset', role: 'FACULTY', password: null, password_reset_token: null, password_reset_expires: null });
      expect((await c.query('SELECT count(*)::int AS n FROM users WHERE password IS NOT NULL OR password_reset_token IS NOT NULL')).rows[0].n).toBe(0);
      expect((await c.query('SELECT max(version)::int AS v FROM schema_migrations')).rows[0].v).toBeGreaterThanOrEqual(25);
    });
  }, 60000);
});

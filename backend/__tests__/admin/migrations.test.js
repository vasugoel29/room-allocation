// OPS-02 regression: startup migrations (src/db.js runMigrations) run each migration in its own
// transaction under a Postgres advisory lock, so two instances booting against the same fresh
// database must both succeed without double-applying anything.
// Simulated with two child processes importing db.js against a throwaway database that this
// file creates and drops itself (roomdb_test_admin_mig). Bounded: each child is killed after 45s.
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
  await withClient(refUrl, (c) => c.query(fs.readFileSync(path.join(backendDir, 'sql/schema_v2.sql'), 'utf8')));
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

// OPS-02: startup migrations (src/db.js testDbConnection) are not transactional and take no
// advisory lock, so two instances booting against the same fresh database race each other.
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
const baseUrl = new URL(process.env.DATABASE_URL);
const migUrl = Object.assign(new URL(baseUrl), { pathname: `/${MIG_DB}` }).toString();
const adminUrl = Object.assign(new URL(baseUrl), { pathname: '/postgres' }).toString();

async function withClient(url, fn) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

const recreate = () => withClient(adminUrl, async (c) => {
  await c.query(`DROP DATABASE IF EXISTS "${MIG_DB}" WITH (FORCE)`);
  await c.query(`CREATE DATABASE "${MIG_DB}"`);
});

/** Runs testDbConnection() in a fresh node process against the throwaway DB; resolves to its boolean result. */
function migrateInChild() {
  const script = "import('./src/db.js').then(async (m) => { const ok = await m.testDbConnection(); await m.pool.end(); process.stdout.write('\\nRESULT=' + ok + '\\n'); })";
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: migUrl, NODE_ENV: 'test' },
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
beforeAll(async () => {
  // The suite's own DB was migrated exactly once by global-setup: that's the reference seed size.
  expectedSlots = Number((await db.query('SELECT count(*) FROM timetable_slots')).rows[0].count);
  await recreate();
  await withClient(migUrl, (c) => c.query(fs.readFileSync(path.join(backendDir, 'sql/schema_v2.sql'), 'utf8')));
}, 30000);

afterAll(async () => {
  await withClient(adminUrl, (c) => c.query(`DROP DATABASE IF EXISTS "${MIG_DB}" WITH (FORCE)`));
  await closeDb();
}, 30000);

test.failing('[OPS-02] two instances migrating a fresh database concurrently both succeed and seed timetable_slots once', async () => {
  expect(expectedSlots).toBeGreaterThan(0);
  const [a, b] = await Promise.all([migrateInChild(), migrateInChild()]);
  const { slots, versions } = await withClient(migUrl, async (c) => ({
    slots: Number((await c.query('SELECT count(*) FROM timetable_slots')).rows[0].count),
    versions: Number((await c.query('SELECT count(*) FROM schema_migrations')).rows[0].count),
  }));
  expect(versions).toBe(20);
  expect(slots).toBe(expectedSlots);
  // Currently one of the two dies with e.g. `duplicate key value violates unique constraint
  // "pg_type_typname_nsp_index"` / "schema_migrations_pkey" and returns false.
  expect([a.ok, b.ok]).toEqual([true, true]);
}, 60000);

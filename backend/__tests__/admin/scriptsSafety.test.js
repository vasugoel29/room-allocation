// Static checks on backend/scripts. NOTHING here executes a script or touches a database:
// the sources are only read as text.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts');
const read = (name) => fs.readFileSync(path.join(scriptsDir, name), 'utf8');

const DESTRUCTIVE = fs.readdirSync(scriptsDir)
  .filter((f) => f.endsWith('.js'))
  .filter((f) => /\b(DELETE\s+FROM|TRUNCATE|DROP\s+(TABLE|SCHEMA|DATABASE))\b/i.test(read(f)));

test('unseed.js is detected as destructive (sanity check for the scan below)', () => {
  expect(DESTRUCTIVE).toContain('unseed.js');
});

// Foreign keys are RESTRICT (rows are only soft-deleted), so the dev reset recreates the schema
// and re-applies the migrations instead of deleting table by table. People come back on their
// next ACL sign-in.
test('unseed.js resets the schema and re-applies migrations; it deletes no rows one table at a time', () => {
  const src = read('unseed.js');
  expect(src).toMatch(/DROP SCHEMA public CASCADE; CREATE SCHEMA public;/);
  expect(src).toMatch(/connectAndMigrate\(\)/);
  expect(src).not.toMatch(/DELETE FROM/i);
});

// Destructive scripts call the shared guard (scripts/lib/guard.js), which is checked below.
const usesGuard = (src) => /assertLocalDatabase\(/.test(src) && /from '\.\/lib\/guard\.js'/.test(src);

test.each(DESTRUCTIVE)('[OPS-01] %s refuses to run when NODE_ENV=production', (file) => {
  const src = read(file);
  if (usesGuard(src)) return;
  expect(src).toMatch(/NODE_ENV[^\n]*['"`]production['"`]/);
  expect(src).toMatch(/process\.exit\(\s*[1-9]|throw new Error/);
});

test.each(DESTRUCTIVE)('[OPS-01] %s refuses to run against a non-local DATABASE_URL', (file) => {
  const src = read(file);
  if (usesGuard(src)) return;
  // Must inspect the DB host (e.g. localhost/127.0.0.1) and bail out otherwise; `includes('localhost')`
  // used only to pick SSL settings doesn't count.
  // A `|| 'postgresql://…localhost…'` default doesn't count either: the line must act on the check.
  const guards = src.split('\n').filter((l) => /DATABASE_URL|hostname|host\b/.test(l) && /(localhost|127\.0\.0\.1)/.test(l)
    && !/ssl/i.test(l) && /\b(if|throw|exit|assert)\b/.test(l));
  expect(guards.length).toBeGreaterThan(0);
});

describe('scripts/lib/guard.js (run in a child process — never touches a database)', () => {
  const run = async (env) => {
    const { spawnSync } = await import('child_process');
    const code = "import('./scripts/lib/guard.js').then(m => { m.assertLocalDatabase(process.env.DATABASE_URL, 'probe'); console.log('ALLOWED'); })";
    return spawnSync(process.execPath, ['-e', code], { cwd: path.resolve(scriptsDir, '..'), env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  };
  test('local database in development → allowed', async () => {
    expect((await run({ DATABASE_URL: 'postgresql://u:p@localhost:5432/roomdb' })).stdout).toContain('ALLOWED');
  });
  test('NODE_ENV=production → refused', async () => {
    const r = await run({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost:5432/roomdb' });
    expect(r.status).toBe(1);
    expect(r.stdout).not.toContain('ALLOWED');
  });
  test('remote host → refused unless explicitly overridden', async () => {
    const remote = 'postgresql://u:p@ep-cool-db.neon.tech:5432/roomdb';
    expect((await run({ DATABASE_URL: remote })).status).toBe(1);
    expect((await run({ DATABASE_URL: remote, ALLOW_REMOTE_DB_SCRIPT: 'i-understand-this-destroys-data' })).stdout).toContain('ALLOWED');
  });
});

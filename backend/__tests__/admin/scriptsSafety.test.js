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

test('unseed.js deletes users with a role filter (it is meant to keep admins)', () => {
  expect(read('unseed.js')).toMatch(/DELETE FROM users WHERE role\s*(!=|<>)/i);
});

// Roles are stored upper-case ('ADMIN'); `role != 'admin'` matches every row, admins included.
test.failing("[OPS-01] unseed.js preserves admins using the stored upper-case role ('ADMIN')", () => {
  const src = read('unseed.js');
  const m = src.match(/DELETE FROM users WHERE ([^'"`]*?role[^)]*?)['"`]\)/i) || src.match(/DELETE FROM users WHERE (.*)$/im);
  expect(m).not.toBeNull();
  const clause = m[1];
  expect(clause).toMatch(/'ADMIN'/);
  expect(clause).not.toMatch(/'admin'/);
});

test.failing.each(DESTRUCTIVE)('[OPS-01] %s refuses to run when NODE_ENV=production', (file) => {
  const src = read(file);
  expect(src).toMatch(/NODE_ENV[^\n]*['"`]production['"`]/);
  expect(src).toMatch(/process\.exit\(\s*[1-9]|throw new Error/);
});

test.failing.each(DESTRUCTIVE)('[OPS-01] %s refuses to run against a non-local DATABASE_URL', (file) => {
  const src = read(file);
  // Must inspect the DB host (e.g. localhost/127.0.0.1) and bail out otherwise; `includes('localhost')`
  // used only to pick SSL settings doesn't count.
  // A `|| 'postgresql://…localhost…'` default doesn't count either: the line must act on the check.
  const guards = src.split('\n').filter((l) => /DATABASE_URL|hostname|host\b/.test(l) && /(localhost|127\.0\.0\.1)/.test(l)
    && !/ssl/i.test(l) && /\b(if|throw|exit|assert)\b/.test(l));
  expect(guards.length).toBeGreaterThan(0);
});

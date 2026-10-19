import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { applyTestEnv } from './test-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Rebuilds the test database the same way a fresh deployment would:
 *   schema_v2.sql  ->  startup migrations in src/db.js  ->  known-drift.sql
 * known-drift.sql holds columns the code needs but no migration creates (audit findings);
 * each entry there should eventually become a real migration and be deleted from that file.
 */
export default async function globalSetup() {
  const dbName = applyTestEnv();
  const url = new URL(process.env.DATABASE_URL);

  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query(fs.readFileSync(path.join(__dirname, '../sql/schema_v2.sql'), 'utf8'));
  await client.end();

  const db = await import('../src/db.js');
  const ok = await db.testDbConnection();
  await db.pool.end();
  if (!ok) throw new Error('Startup migrations failed against the test database');

  const drift = new pg.Client({ connectionString: url.toString() });
  await drift.connect();
  await drift.query(fs.readFileSync(path.join(__dirname, 'known-drift.sql'), 'utf8'));
  // Faculty-directory ids must never coincide with user ids in tests, so any code or test that
  // mixes the two id spaces fails loudly instead of passing by accident.
  await drift.query('ALTER SEQUENCE faculties_id_seq RESTART WITH 500000');
  await drift.end();
}

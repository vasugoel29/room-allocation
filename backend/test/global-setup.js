import pg from 'pg';
import { applyTestEnv } from './test-env.js';

/**
 * Rebuilds the test database the same way a fresh deployment would: an empty schema, then the
 * startup migrations in src/db.js (v1 is the baseline). Nothing is read from files.
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
  // An empty schema: migrations (v1 = baseline) build everything; nothing is read from files.
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();

  const db = await import('../src/db.js');
  const ok = await db.testDbConnection();
  await db.pool.end();
  if (!ok) throw new Error('Startup migrations failed against the test database');

  const drift = new pg.Client({ connectionString: url.toString() });
  await drift.connect();
  // Faculty-directory ids must never coincide with user ids in tests, so any code or test that
  // mixes the two id spaces fails loudly instead of passing by accident.
  await drift.query('ALTER SEQUENCE faculties_id_seq RESTART WITH 500000');
  await drift.end();
}

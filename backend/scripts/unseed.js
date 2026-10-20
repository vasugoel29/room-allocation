// Development reset: empties the local database by recreating its schema, then re-applies the
// migrations. `npm run seed` afterwards loads the reference data again. Rows are never deleted one
// table at a time: foreign keys are RESTRICT (production rows are only ever soft-deleted).
import pkg from 'pg';
import '../src/config/env.js';
import { assertLocalDatabase } from './lib/guard.js';

const { Pool } = pkg;
assertLocalDatabase(process.env.DATABASE_URL, 'unseed.js');

async function unseed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log('Resetting the database schema...');
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  } finally {
    await pool.end();
  }
  const db = await import('../src/db.js');
  await db.connectAndMigrate();
  await db.pool.end();
  console.log('Database reset: empty schema at the latest migration. Run `npm run seed` to load rooms and faculty.');
}

unseed().catch((err) => {
  console.error('Unseeding failed:', err.message);
  process.exitCode = 1;
});

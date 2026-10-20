// Creates the database named in DATABASE_URL if it doesn't exist yet (local databases only).
// Never drops anything. Then run the server or `npm run seed`: migrations build the schema.
import '../src/config/env.js';
import pkg from 'pg';
import { assertLocalDatabase } from './lib/guard.js';

const { Client } = pkg;

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  assertLocalDatabase(connectionString, 'create_db.js');
  const url = new URL(connectionString);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unexpected database name "${name}"`);
  url.pathname = '/postgres';
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rowCount) console.log(`Database ${name} already exists`);
    else { await client.query(`CREATE DATABASE "${name}"`); console.log(`Created database ${name}`); }
  } finally {
    await client.end();
  }
}

run().catch((err) => { console.error(err.message); process.exitCode = 1; });

import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load env.development config
dotenv.config({ path: path.resolve(__dirname, '../.env.development') });

async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://roomuser:roompass@localhost:5432/roomdb';
  console.log(`Loaded DATABASE_URL: ${connectionString}`);

  // Connect to 'postgres' system database to perform DROP/CREATE DATABASE
  const url = new URL(connectionString);
  url.pathname = '/postgres';
  const adminUrl = url.toString();

  console.log(`Connecting to admin database to recreate trial DB...`);
  const client = new Client({
    connectionString: adminUrl,
    ssl: adminUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    console.log('Dropping database roomdb_trial if exists...');
    // Force disconnect active connections so we can drop it
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = 'roomdb_trial'
        AND pid <> pg_backend_pid();
    `);
    await client.query('DROP DATABASE IF EXISTS roomdb_trial');
    
    console.log('Creating database roomdb_trial...');
    await client.query('CREATE DATABASE roomdb_trial');
    console.log('Successfully recreated database roomdb_trial!');
  } catch (err) {
    console.error('Error recreating database:', err);
  } finally {
    await client.end();
  }
}

run();

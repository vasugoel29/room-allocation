import pkg from 'pg';
const { Pool } = pkg;
import '../src/config/env.js';
import { testDbConnection } from '../src/db.js';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const client = pool; // use direct pool query

  try {
    console.log('Wiping database public schema...');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    console.log('Database wiped successfully.');
  } catch (err) {
    console.error('Wipe failed:', err);
    process.exit(1);
  }

  try {
    console.log('Running initial database migrations...');
    await testDbConnection();
    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration execution failed:', err);
    process.exit(1);
  }

  // Close main reset pool so children can connect
  await pool.end();

  const backendDir = path.resolve(__dirname, '..');
  try {
    console.log('Running Room Seeder...');
    execSync('node src/db/seeders/seed_rooms.js', { cwd: backendDir, stdio: 'inherit' });

    console.log('Running Timetables Seeder...');
    execSync('node src/db/seeders/seed_timetables.js', { cwd: backendDir, stdio: 'inherit' });

    console.log('Running Student Seeder...');
    execSync('node src/db/seeders/seed_students.js', { cwd: backendDir, stdio: 'inherit' });

    console.log('All seeders ran successfully! Database reset and seeded.');
  } catch (err) {
    console.error('Seeder execution failed:', err);
    process.exit(1);
  }
}

main();

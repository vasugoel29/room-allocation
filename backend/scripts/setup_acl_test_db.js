import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.development') });

async function setup() {
  const targetDbName = 'roomdb_acl_test';
  const connectionString = process.env.DATABASE_URL || `postgresql://roomuser:roompass@localhost:5432/${targetDbName}`;
  console.log(`Setting up target DB: ${targetDbName}...`);

  const url = new URL(connectionString);
  url.pathname = '/postgres';
  const adminUrl = url.toString();

  const adminClient = new Client({
    connectionString: adminUrl,
    ssl: false
  });

  await adminClient.connect();
  try {
    const res = await adminClient.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDbName]
    );

    if (res.rowCount === 0) {
      console.log(`Creating database ${targetDbName}...`);
      await adminClient.query(`CREATE DATABASE ${targetDbName}`);
      console.log(`Database ${targetDbName} created successfully.`);
    } else {
      console.log(`Database ${targetDbName} already exists.`);
    }
  } catch (err) {
    console.error('Error verifying/creating database:', err);
    throw err;
  } finally {
    await adminClient.end();
  }

  // Connect to roomdb_acl_test and run testDbConnection to apply migrations
  console.log(`Applying migrations to ${targetDbName}...`);
  const { testDbConnection } = await import('../src/db.js');
  await testDbConnection();

  // Make password column nullable in users table for Google/ACL auth
  const { pool } = await import('../src/db.js');
  await pool.query(`ALTER TABLE users ALTER COLUMN password DROP NOT NULL;`);
  
  // Seed a sample room if none exists so room view & booking can be tested
  const roomRes = await pool.query('SELECT COUNT(*) FROM rooms');
  if (parseInt(roomRes.rows[0].count) === 0) {
    console.log('Seeding initial test rooms...');
    await pool.query(`
      INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector, type)
      VALUES 
        ('LH-101', '5th Block', 1, 60, true, true, 'Lecture Hall'),
        ('LH-102', '5th Block', 1, 60, true, false, 'Lecture Hall'),
        ('CR-201', '5th Block', 2, 40, false, true, 'Classroom')
      ON CONFLICT (name) WHERE is_active DO NOTHING;
    `);
  }

  console.log(`Database ${targetDbName} is ready!`);
  process.exit(0);
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});

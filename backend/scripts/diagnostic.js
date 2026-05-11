import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

async function check() {
  const client = await pool.connect();
  try {
    const countRes = await client.query('SELECT COUNT(*) FROM room_availability');
    const sampleRes = await client.query('SELECT * FROM room_availability LIMIT 3');
    
    console.log('=== NEON DB CHECK ===');
    console.log(`Total availability rows: ${countRes.rows[0].count}`);
    console.log('Sample rows:', sampleRes.rows);
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

check();

import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config({ path: './.env.development' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query('SELECT count(*) FROM timetable_slots');
    console.log('Timetable slots count:', res.rows[0].count);
    const sample = await pool.query('SELECT * FROM timetable_slots LIMIT 1');
    console.log('Sample row:', JSON.stringify(sample.rows[0], null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
check();

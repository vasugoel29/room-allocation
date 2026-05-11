import pkg from 'pg';
const { Pool } = pkg;
import '../src/config/env.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verify() {
  try {
    const res = await pool.query('SELECT role, COUNT(*) FROM users GROUP BY role');
    console.log('User counts by role:');
    console.table(res.rows);
    
    const sample = await pool.query('SELECT name, email FROM users WHERE role = $1 LIMIT 5', ['STUDENT_REP']);
    console.log('Sample Seeded Users:');
    console.table(sample.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

verify();

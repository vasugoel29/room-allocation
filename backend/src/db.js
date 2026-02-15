// db.js
// Handles PostgreSQL connection using node-postgres (pg)
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

export const query = (text, params) => pool.query(text, params);

/**
 * Tests the database connection and logs the result
 */
export async function testDbConnection() {
  try {
    const client = await pool.connect();
    console.log('Database connected successfully');
    client.release();
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.stack);
    return false;
  }
}

// Auto-check on import (opt-in/guarded)
if (process.env.NODE_ENV !== 'test') {
  testDbConnection();
}

export { pool };



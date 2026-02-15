import pkg from 'pg';
import logger from './utils/logger.js';
const { Pool } = pkg;

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
  connectionTimeoutMillis: 5000, // Terminate connection attempt after 5 seconds
});

export const query = (text, params) => pool.query(text, params);

/**
 * Tests the database connection and logs the result
 */
export async function testDbConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1'); // Validate full query path
    console.log('Database connected successfully');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err);
    return false;
  } finally {
    if (client) client.release();
  }
}

// Auto-check on import (opt-in/guarded)
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      const isConnected = await testDbConnection();
      if (!isConnected) {
        logger.error('Startup failed: Database connection could not be established', new Error('Database connection failed'));
        process.exit(1);
      }
    } catch (err) {
      logger.error('Startup failed: Error during database connection test', err);
      process.exit(1);
    }
  })();
}

export { pool };



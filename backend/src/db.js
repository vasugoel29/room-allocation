import pkg from 'pg';
import logger from './utils/logger.js';
const { Pool } = pkg;

let poolConfig = {
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
  connectionTimeoutMillis: 5000,
};

if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    poolConfig = {
      user: url.username,
      password: url.password,
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    };
  } catch (error) {
    logger.error('Failed to parse DATABASE_URL', error);
  }
}

const pool = new Pool(poolConfig);

export const query = (text, params) => pool.query(text, params);

/**
 * Tests the database connection and logs the result
 */
export async function testDbConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1'); // Validate full query path
    
    // Ensure promotion_requests table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS promotion_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'PENDING',
        reason TEXT,
        admin_comment TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, status)
      )
    `);

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



import './config/env.js';
import pkg from 'pg';
import logger from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const { Pool } = pkg;

let poolConfig = {
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
  connectionTimeoutMillis: 15000,
};

if (process.env.DATABASE_URL) {
  try {
    const url = new URL(process.env.DATABASE_URL);
    const isLocalhost = url.hostname === 'localhost';
    
    poolConfig = {
      user: url.username,
      password: url.password,
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    };
  } catch (error) {
    logger.error('Failed to parse DATABASE_URL', error);
  }
}

const pool = new Pool(poolConfig);

// Add error listener to prevent process crashes on idle client socket errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', err);
});

export const query = (text, params) => pool.query(text, params);

export const runInTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


export async function testDbConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');

    // Create migration tracker
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255),
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT MAX(version) as current_version FROM schema_migrations');
    const currentVersion = rows[0].current_version || 0;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationsDir = path.resolve(__dirname, './db/migrations');

    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        const match = file.match(/^(\d+)[_-]/);
        if (!match) continue;
        const version = parseInt(match[1]);

        if (version > currentVersion) {
          logger.info(`Applying migration v${version}: ${file}`);
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          
          await client.query('BEGIN');
          try {
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [version, file]);
            await client.query('COMMIT');
          } catch (migrationErr) {
            await client.query('ROLLBACK');
            throw migrationErr;
          }
        }
      }
    } else {
      logger.warn(`Migrations directory not found at: ${migrationsDir}`);
    }

    // Ensure at least one ADMIN user exists
    const adminCheck = await client.query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    if (adminCheck.rowCount === 0) {
      logger.info('No admin user found. Seeding default admin account (admin@nsut.ac.in)...');
      await client.query(`
        INSERT INTO users (name, email, password_hash, role, is_approved)
        VALUES ('System Admin', 'admin@nsut.ac.in', '$2b$10$qw1.tfluRGLBfzWMD/w2wunb9HA/kqmOoV7UG9VtWaa5TW4qkeGTu', 'ADMIN', true)
        ON CONFLICT (email) DO NOTHING
      `);
    }

    logger.info('Database connected and migrations synchronized');
    return true;
  } catch (err) {
    logger.error('Database connection failed', err);
    return false;
  } finally {
    if (client) client.release();
  }
}

// Auto-check on import with retry for Neon cold starts
if (process.env.NODE_ENV !== 'test') {
  (async () => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 3000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const isConnected = await testDbConnection();
        if (isConnected) return; // Success — exit the retry loop

        logger.error(`Database connection attempt ${attempt}/${MAX_RETRIES} failed`);
      } catch (err) {
        logger.error(`Database connection attempt ${attempt}/${MAX_RETRIES} threw an error`, err);
      }

      if (attempt < MAX_RETRIES) {
        logger.info(`Retrying database connection in ${RETRY_DELAY_MS / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    logger.error('Startup failed: Database connection could not be established after all retries', new Error('Database connection failed'));
    process.exit(1);
  })();
}

export { pool };

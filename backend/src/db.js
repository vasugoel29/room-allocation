import './config/env.js';
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
    const isLocalhost = url.hostname === 'localhost';
    
    poolConfig = {
      user: url.username,
      password: url.password,
      host: url.hostname,
      port: url.port || 5432,
      database: url.pathname.slice(1),
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
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
/**
 * Simple Migration System (ENG-15)
 */
const migrations = [
  {
    version: 1,
    name: 'Initial Schema',
    run: async (client) => {
      // (Actually the baseline tables like users, bookings, etc are assumed existing or created IF NOT EXISTS)
      // This is a placeholder for the first versioned sync
    }
  },
  {
    version: 2,
    name: 'Promotions and Departments',
    run: async (client) => {
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
        );
        CREATE TABLE IF NOT EXISTS departments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL
        );
        ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;
      `);
    }
  },
  {
    version: 3,
    name: 'Transfers and Constraints',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS booking_transfers (
          id SERIAL PRIMARY KEY,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
          requested_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
          target_faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          new_purpose TEXT,
          status VARCHAR(20) DEFAULT 'PENDING',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(booking_id, requested_by)
        );
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_section_check;
        ALTER TABLE users ADD CONSTRAINT users_section_check CHECK (section BETWEEN 1 AND 15);
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_year_check;
        ALTER TABLE users ADD CONSTRAINT users_year_check CHECK (year BETWEEN 1 AND 5);
      `);
    }
  },
  {
    version: 4,
    name: 'Performance and Availability Updates',
    run: async (client) => {
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS btree_gist;
        CREATE INDEX IF NOT EXISTS idx_rooms_filters ON rooms (capacity, has_ac, has_projector);
        CREATE INDEX IF NOT EXISTS idx_bookings_range_gist ON bookings USING GIST (room_id, tstzrange(start_time, end_time));
        CREATE INDEX IF NOT EXISTS idx_bookings_user_range ON bookings USING GIST (created_by, tstzrange(start_time, end_time));
        CREATE INDEX IF NOT EXISTS idx_availability_room_day_hour ON room_availability (room_id, day, hour);
        ALTER TABLE room_availability ALTER COLUMN day TYPE VARCHAR(20);
        ALTER TABLE room_availability ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        ALTER TABLE room_availability ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        CREATE INDEX IF NOT EXISTS idx_availability_user_id ON room_availability (user_id);
      `);
    }
  },
  {
    version: 5,
    name: 'Auth and Seed Data',
    run: async (client) => {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
      `);
      
      const defaultDepts = [
        'Computer Science (CSE)', 'Information Technology (IT)', 
        'Electronics & Communication (ECE)', 'Electrical Engineering (EE)',
        'Mechanical Engineering (ME)', 'Instrumentation & Control (ICE)',
        'Biotechnology', 'Mathematics', 'Physics', 'Humanities & Management'
      ];
      for (const dept of defaultDepts) {
        await client.query('INSERT INTO departments (name) VALUES ($1) ON CONFLICT DO NOTHING', [dept]);
      }
    }
  },
  {
    version: 6,
    name: 'Audit Logs (PROD-06)',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(100) NOT NULL,
          entity_type VARCHAR(50),
          entity_id INTEGER,
          details JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
        CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
      `);
    }
  }
];

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

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info(`Applying migration v${migration.version}: ${migration.name}`);
        await migration.run(client);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
      }
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



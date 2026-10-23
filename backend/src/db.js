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


/**
 * Tests the database connection and logs the result
 */
/**
 * Baseline schema (formerly sql/schema_v2.sql), applied by migration v1 to a brand-new database.
 * Kept inline so migrations never read files.
 */
export const BASE_SCHEMA = `
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255),
  role VARCHAR(50) DEFAULT 'VIEWER',

  branch VARCHAR(255),
  year INT CHECK (year BETWEEN 1 AND 4),
  section INT CHECK (section BETWEEN 1 AND 4),
  department VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms Table
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(32) UNIQUE NOT NULL,
  building VARCHAR(255),
  floor INT,
  capacity INT DEFAULT 30,
  has_ac BOOLEAN DEFAULT FALSE,
  has_projector BOOLEAN DEFAULT FALSE,
  type VARCHAR(50) DEFAULT 'Lecture Room',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Room Availability Table (Legacy support / Scheduled Classes)
CREATE TABLE IF NOT EXISTS room_availability (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  day VARCHAR(8) NOT NULL,
  hour INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  UNIQUE(room_id, day, hour)
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  purpose TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CANCELLED
  is_semester_booking BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Booking History
CREATE TABLE IF NOT EXISTS booking_history (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  previous_start_time TIMESTAMPTZ,
  previous_end_time TIMESTAMPTZ,
  previous_room_id INTEGER REFERENCES rooms(id),
  modified_by INTEGER REFERENCES users(id),
  change_type VARCHAR(50), -- RESCHEDULE, CANCEL
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Constraints
-- 1. One user → one room per slot (ACTIVE bookings only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_slot_active ON bookings (created_by, start_time) 
WHERE status = 'ACTIVE';

-- 2. One room → one booking per slot (ACTIVE bookings only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_slot_active ON bookings (room_id, start_time) 
WHERE status = 'ACTIVE';
`;

/**
 * Simple Migration System (ENG-15)
 */
const migrations = [
  {
    version: 1,
    name: 'Initial Schema',
    run: async (client) => {
      // Baseline schema for a brand-new database only. Never drops anything: if the core
      // tables already exist this is a no-op (existing deployments predate the tracker).
      const { rows } = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS exists`);
      if (rows[0].exists) return;
      await client.query(BASE_SCHEMA);
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
  },
  {
    version: 7,
    name: 'Faculty Timetable',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS faculty_timetable_slots (
          id SERIAL PRIMARY KEY,
          faculty_name VARCHAR(255) NOT NULL,
          semester VARCHAR(20),
          day_of_week VARCHAR(20) NOT NULL,
          slot_time VARCHAR(50) NOT NULL,
          content TEXT,
          is_occupied BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_faculty_tt_name ON faculty_timetable_slots(faculty_name);
        CREATE INDEX IF NOT EXISTS idx_faculty_tt_day ON faculty_timetable_slots(day_of_week);
      `);
    }
  },
  {
    version: 8,
    name: 'Faculty Slot Overrides',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS faculty_slot_overrides (
          id SERIAL PRIMARY KEY,
          faculty_name VARCHAR(255) NOT NULL,
          date DATE NOT NULL,
          hour INTEGER NOT NULL,
          is_cancelled BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(faculty_name, date, hour)
        );
        CREATE INDEX IF NOT EXISTS idx_faculty_override_date ON faculty_slot_overrides(date);
      `);
    }
  },
  {
    version: 9,
    name: 'Additional Student Seeding Columns',
    run: async (client) => {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS degree VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_no VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS department_name VARCHAR(255);
      `);
    }
  },
  {
    version: 10,
    name: 'Create and Seed Timetable Slots',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS timetable_slots (
          id SERIAL PRIMARY KEY,
          department TEXT,
          degree TEXT,
          specialization TEXT,
          section TEXT,
          year TEXT,
          semester TEXT,
          day_of_week TEXT,
          slot_time TEXT,
          subject_code TEXT,
          subject_name TEXT,
          room_name TEXT,
          type TEXT,
          batch TEXT,
          faculty_name TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_timetable_slots_faculty ON timetable_slots(UPPER(faculty_name));
        CREATE INDEX IF NOT EXISTS idx_timetable_slots_section ON timetable_slots(UPPER(department), semester, section);
      `);

      // The section timetable used to be seeded here from hajiri.timetables.json. Migrations no
      // longer read files or seed data (databases where this ran are unaffected): timetables
      // arrive through the admin import, and `npm run seed -- --demo-timetable` loads a demo.
    }
  },
  {
    version: 11,
    name: 'Room Types Schema & Seeding',
    run: async (client) => {
      await client.query(`
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'Lecture Room';
        
        -- Update specific room types
        UPDATE rooms SET type = 'Committee Room' WHERE name IN ('5013', '5014', '5015');
        UPDATE rooms SET type = 'Auditorium' WHERE name IN ('5027', '5028', '5301');
        UPDATE rooms SET type = 'Lab' WHERE name IN ('5310', '5311', '5312', '5138');
      `);
    }
  },
  {
    version: 12,
    name: 'Timetable Slot Room Association',
    run: async (client) => {
      await client.query(`
        ALTER TABLE faculty_timetable_slots
          ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_faculty_tt_room ON faculty_timetable_slots(room_id);
      `);
    }
  },
  {
    version: 13,
    name: 'Class Cancellation Approval Requests',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS class_cancellation_requests (
          id SERIAL PRIMARY KEY,
          requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          room_name VARCHAR(255) NOT NULL,
          subject_name VARCHAR(255),
          class_date DATE NOT NULL,
          hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
          booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_cancellation_requests_faculty ON class_cancellation_requests(faculty_id, status);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_cancellation_request
          ON class_cancellation_requests(faculty_id, room_name, class_date, hour)
          WHERE status = 'PENDING';
      `);
    }
  },
  {
    version: 14,
    name: 'Room Description and Student Access',
    run: async (client) => {
      await client.query(`
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE rooms ADD COLUMN IF NOT EXISTS student_access BOOLEAN DEFAULT TRUE;
      `);
    }
  },
  {
    version: 15,
    name: 'Department ON DELETE SET NULL Constraint',
    run: async (client) => {
      await client.query(`
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_id_fkey;
        ALTER TABLE users ADD CONSTRAINT users_department_id_fkey 
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
      `);
    }
  },
  {
    version: 16,
    name: 'Rename and Clean Departments to start with Department of',
    run: async (client) => {
      const depts = await client.query("SELECT id, name FROM departments");
      for (const d of depts.rows) {
        if (!d.name.startsWith('Department of')) {
          const newName = `Department of ${d.name}`;
          const conflict = await client.query("SELECT id FROM departments WHERE name = $1", [newName]);
          if (conflict.rowCount > 0) {
            await client.query("UPDATE users SET department_id = $1 WHERE department_id = $2", [conflict.rows[0].id, d.id]);
            await client.query("DELETE FROM departments WHERE id = $1", [d.id]);
          } else {
            await client.query("UPDATE departments SET name = $1 WHERE id = $2", [newName, d.id]);
          }
        }
      }
      await client.query("DELETE FROM departments WHERE name NOT LIKE 'Department of%'");
    }
  },
  {
    version: 17,
    name: 'Merge duplicate departments with normalization',
    run: async (client) => {
      const depts = await client.query("SELECT id, name FROM departments");
      const groups = {};

      const normalizeName = (name) => {
        let norm = name.toLowerCase();
        
        // Remove parentheses ONLY if they do NOT contain 'east' or 'west'
        norm = norm.replace(/\(([^)]+)\)/g, (match, contents) => {
          const trimmed = contents.trim();
          if (trimmed.includes('east') || trimmed.includes('west')) {
            return `(${trimmed})`;
          }
          return '';
        });

        return norm
          .replace(/^department of\s+/, '')
          .replace(/&/g, 'and')
          .replace(/engineering/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      };

      for (const d of depts.rows) {
        const norm = normalizeName(d.name);
        if (!groups[norm]) {
          groups[norm] = [];
        }
        groups[norm].push(d);
      }

      for (const [norm, list] of Object.entries(groups)) {
        if (list.length > 1) {
          const sorted = list.sort((a, b) => {
            const aHasLower = /[a-z]/.test(a.name);
            const bHasLower = /[a-z]/.test(b.name);
            if (aHasLower && !bHasLower) return -1;
            if (!aHasLower && bHasLower) return 1;

            const aHasParens = /\(.*?\)/.test(a.name);
            const bHasParens = /\(.*?\)/.test(b.name);
            if (aHasParens && !bHasParens) return -1;
            if (!aHasParens && bHasParens) return 1;

            return a.name.length - b.name.length;
          });

          const best = sorted[0];
          const duplicates = sorted.slice(1);

          for (const dup of duplicates) {
            await client.query("UPDATE users SET department_id = $1 WHERE department_id = $2", [best.id, dup.id]);
            await client.query("DELETE FROM departments WHERE id = $1", [dup.id]);
          }
        }
      }
    }
  },
  {
    version: 18,
    name: 'Capitalize department names and merge duplicates',
    run: async (client) => {
      const toTitleCase = (str) => {
        return str
          .toLowerCase()
          .split(' ')
          .map(word => {
            if (word.startsWith('(') && word.endsWith(')')) {
              const inner = word.slice(1, -1);
              if (inner.length <= 3 && inner !== 'and') {
                return '(' + inner.toUpperCase() + ')';
              }
              return '(' + inner.charAt(0).toUpperCase() + inner.slice(1) + ')';
            }
            if (['cse', 'it', 'ece', 'ee', 'me', 'ice'].includes(word)) {
              return word.toUpperCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
          })
          .join(' ');
      };

      const depts = await client.query("SELECT id, name FROM departments");
      for (const d of depts.rows) {
        const capitalized = toTitleCase(d.name);
        if (capitalized !== d.name) {
          // Check if a department with the capitalized name already exists
          const conflict = await client.query("SELECT id FROM departments WHERE name = $1", [capitalized]);
          if (conflict.rowCount > 0) {
            // Merge users to the existing one and delete duplicate
            await client.query("UPDATE users SET department_id = $1 WHERE department_id = $2", [conflict.rows[0].id, d.id]);
            await client.query("DELETE FROM departments WHERE id = $1", [d.id]);
          } else {
            // Rename to capitalized
            await client.query("UPDATE departments SET name = $1 WHERE id = $2", [capitalized, d.id]);
          }
        }
      }
    }
  },
  {
    version: 19,
    name: 'Capitalize faculty names to Title Case across database',
    run: async (client) => {
      const toTitleCase = (str) => {
        if (!str) return str;
        return str
          .toLowerCase()
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      };

      // 1. Update users table where role = 'FACULTY'
      const users = await client.query("SELECT id, name FROM users WHERE role = 'FACULTY'");
      for (const u of users.rows) {
        const capitalized = toTitleCase(u.name);
        if (capitalized !== u.name) {
          await client.query("UPDATE users SET name = $1 WHERE id = $2", [capitalized, u.id]);
        }
      }

      // 2. Update timetable_slots table faculty_name column
      const slots = await client.query("SELECT DISTINCT faculty_name FROM timetable_slots WHERE faculty_name IS NOT NULL");
      for (const s of slots.rows) {
        const capitalized = toTitleCase(s.faculty_name);
        if (capitalized !== s.faculty_name) {
          await client.query("UPDATE timetable_slots SET faculty_name = $1 WHERE faculty_name = $2", [capitalized, s.faculty_name]);
        }
      }

      // 3. Update faculty_timetable_slots table faculty_name column
      const fSlots = await client.query("SELECT DISTINCT faculty_name FROM faculty_timetable_slots WHERE faculty_name IS NOT NULL");
      for (const fs of fSlots.rows) {
        const capitalized = toTitleCase(fs.faculty_name);
        if (capitalized !== fs.faculty_name) {
          await client.query("UPDATE faculty_timetable_slots SET faculty_name = $1 WHERE faculty_name = $2", [capitalized, fs.faculty_name]);
        }
      }
    }
  },
  {
    version: 20,
    name: 'Student/Faculty Schema Restructure: branches table, semester, group',
    run: async (client) => {
      // 1. Create normalized branches table
      await client.query(`
        CREATE TABLE IF NOT EXISTS branches (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          short_code VARCHAR(100),
          department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(name, department_id)
        );
        ALTER TABLE branches ALTER COLUMN short_code TYPE VARCHAR(100);
        CREATE INDEX IF NOT EXISTS idx_branches_dept ON branches(department_id);
      `);

      // 2. Seed branches from existing distinct user branch values
      await client.query(`
        INSERT INTO branches (name, short_code, department_id)
        SELECT DISTINCT ON (UPPER(u.branch))
          u.branch AS name,
          UPPER(u.branch) AS short_code,
          u.department_id
        FROM users u
        WHERE u.branch IS NOT NULL AND u.branch != ''
        ON CONFLICT DO NOTHING
      `);

      // 3. Add new columns to users table
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS semester INTEGER CHECK (semester BETWEEN 1 AND 8);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS group_name INTEGER;
      `);

      // 4. Back-fill branch_id from existing branch text for students
      await client.query(`
        UPDATE users u
        SET branch_id = b.id
        FROM branches b
        WHERE UPPER(u.branch) = UPPER(b.name)
          AND u.role IN ('VIEWER', 'STUDENT_REP')
          AND u.branch IS NOT NULL
      `);

      // 5. Back-fill semester from year (even semester mapping: year * 2).
      // The legacy schema permits year 5, but semesters are constrained to 1–8.
      // Do not derive an invalid semester (10) for those legacy records.
      await client.query(`
        UPDATE users
        SET semester = year * 2
        WHERE role IN ('VIEWER', 'STUDENT_REP')
          AND year BETWEEN 1 AND 4
          AND semester IS NULL
      `);

      // 6. NULL out student-only fields for faculty rows
      await client.query(`
        UPDATE users
        SET branch = NULL, branch_id = NULL, section = NULL, year = NULL, semester = NULL, group_name = NULL
        WHERE role = 'FACULTY'
      `);
    }
  },
  {
    version: 21,
    name: 'Create faculties catalog table',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS faculties (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
          department_name VARCHAR(255),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Seed initial faculties from existing users where role = 'FACULTY'
        INSERT INTO faculties (name, email, department_id, department_name, is_active)
        SELECT u.name, u.email, u.department_id, d.name, true
        FROM users u
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE u.role = 'FACULTY'
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name, 
            department_id = EXCLUDED.department_id, 
            department_name = EXCLUDED.department_name, 
            is_active = true;
      `);
    }
  },
  {
    version: 22,
    name: 'ACL identity: users.acl_id, session_version, user_access snapshot',
    run: async (client) => {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS acl_id VARCHAR(64);
        CREATE UNIQUE INDEX IF NOT EXISTS users_acl_id_key ON users(acl_id) WHERE acl_id IS NOT NULL;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

        CREATE TABLE IF NOT EXISTS user_access (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          acl_id VARCHAR(64) NOT NULL,
          role VARCHAR(32) NOT NULL,
          roles JSONB NOT NULL DEFAULT '[]',
          permissions JSONB NOT NULL DEFAULT '[]',
          allowed_scope JSONB NOT NULL DEFAULT '{}',
          scopes_by_permission JSONB NOT NULL DEFAULT '{}',
          academic JSONB NOT NULL DEFAULT '{}',
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    }
  },
  {
    version: 23,
    name: 'Faculty directory: link to users, faculty references point at faculties(id)',
    run: async (client) => {
      await client.query(`
        -- 1. The directory knows which sign-in account (if any) belongs to each faculty member.
        ALTER TABLE faculties ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS faculties_user_id_key ON faculties(user_id) WHERE user_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS faculties_email_lower_key ON faculties(lower(email));

        -- 2. Every account referenced as a faculty, or holding the FACULTY role, gets a directory entry.
        INSERT INTO faculties (name, email, department_id, department_name, is_active)
        SELECT u.name, lower(u.email), u.department_id, d.name, true
          FROM users u LEFT JOIN departments d ON d.id = u.department_id
         WHERE u.role = 'FACULTY'
            OR u.id IN (SELECT faculty_id FROM bookings WHERE faculty_id IS NOT NULL)
            OR u.id IN (SELECT target_faculty_id FROM booking_transfers WHERE target_faculty_id IS NOT NULL)
            OR u.id IN (SELECT faculty_id FROM class_cancellation_requests)
        ON CONFLICT DO NOTHING;
        UPDATE faculties f SET user_id = u.id FROM users u
         WHERE f.user_id IS NULL AND lower(f.email) = lower(u.email);

        -- 3. Re-point faculty references from users(id) to faculties(id).
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_faculty_id_fkey;
        UPDATE bookings b SET faculty_id = f.id FROM faculties f WHERE f.user_id = b.faculty_id;
        ALTER TABLE bookings ADD CONSTRAINT bookings_faculty_id_fkey
          FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE SET NULL;

        ALTER TABLE booking_transfers DROP CONSTRAINT IF EXISTS booking_transfers_target_faculty_id_fkey;
        UPDATE booking_transfers t SET target_faculty_id = f.id FROM faculties f WHERE f.user_id = t.target_faculty_id;
        ALTER TABLE booking_transfers ADD CONSTRAINT booking_transfers_target_faculty_id_fkey
          FOREIGN KEY (target_faculty_id) REFERENCES faculties(id) ON DELETE SET NULL;

        ALTER TABLE class_cancellation_requests DROP CONSTRAINT IF EXISTS class_cancellation_requests_faculty_id_fkey;
        UPDATE class_cancellation_requests c SET faculty_id = f.id FROM faculties f WHERE f.user_id = c.faculty_id;
        ALTER TABLE class_cancellation_requests ADD CONSTRAINT class_cancellation_requests_faculty_id_fkey
          FOREIGN KEY (faculty_id) REFERENCES faculties(id) ON DELETE CASCADE;

        CREATE INDEX IF NOT EXISTS idx_bookings_faculty ON bookings(faculty_id);
      `);
    }
  },
  {
    version: 24,
    name: 'Soft delete: is_active + deactivated_at on every table the UI can delete from',
    run: async (client) => {
      // Product rule: deletes from the app never remove rows; they deactivate them.
      for (const table of ['users', 'faculties', 'rooms', 'departments', 'branches', 'faculty_timetable_slots']) {
        await client.query(`
          ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
          UPDATE ${table} SET is_active = TRUE WHERE is_active IS NULL;
          ALTER TABLE ${table} ALTER COLUMN is_active SET NOT NULL;
          ALTER TABLE ${table} ALTER COLUMN is_active SET DEFAULT TRUE;
          ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
          CREATE INDEX IF NOT EXISTS idx_${table}_active ON ${table}(is_active);
        `);
      }
      // Names stay unique among active rows only, so a deactivated room/department/branch name can be reused.
      await client.query(`
        ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_name_key;
        CREATE UNIQUE INDEX IF NOT EXISTS rooms_name_active_key ON rooms(name) WHERE is_active;
        ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_name_key;
        CREATE UNIQUE INDEX IF NOT EXISTS departments_name_active_key ON departments(name) WHERE is_active;
      `);
    }
  },
  {
    version: 25,
    name: 'Google SSO only: clear stored password hashes and reset tokens',
    run: async (client) => {
      // CRAS no longer has passwords (sign-in is Google SSO + ACL), and the old ones were leaked.
      // Rows are kept; only the dead credentials are cleared.
      // (Re-runnable: the columns themselves are dropped later, by v35.)
      const { rows: [col] } = await client.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'password'",
      );
      if (!col) return;
      await client.query(`
        UPDATE users SET password = NULL, password_reset_token = NULL, password_reset_expires = NULL
         WHERE password IS NOT NULL OR password_reset_token IS NOT NULL OR password_reset_expires IS NOT NULL;
      `);
    }
  },
  {
    version: 26,
    name: 'Booking integrity: exclusion constraints and dated room releases',
    run: async (client) => {
      await client.query('CREATE EXTENSION IF NOT EXISTS btree_gist');

      // Existing rows that would violate the new rules are cancelled (kept), newest first, so the
      // constraints can be added. Each cancelled row is recorded in audit_logs.
      const cancelOverlaps = async (label, partitionCol, statuses, extraWhere = '') => {
        const { rows } = await client.query(`
          WITH candidates AS (
            SELECT id, ${partitionCol} AS k, start_time, end_time, created_at FROM bookings
             WHERE status = ANY($1) ${extraWhere}
          ), losers AS (
            SELECT DISTINCT b.id FROM candidates a JOIN candidates b
              ON a.k = b.k AND a.id <> b.id
             AND tstzrange(a.start_time, a.end_time) && tstzrange(b.start_time, b.end_time)
             AND (b.created_at, b.id) > (a.created_at, a.id)
          )
          UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
           WHERE id IN (SELECT id FROM losers) RETURNING id`, [statuses]);
        for (const r of rows) {
          await client.query(
            `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (NULL, 'MIGRATION_CANCEL_OVERLAP', 'booking', $1, $2)`,
            [r.id, JSON.stringify({ rule: label })],
          );
        }
      };
      await client.query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW() WHERE end_time <= start_time AND status IN ('ACTIVE','PENDING')`);
      await cancelOverlaps('room', 'room_id', ['ACTIVE']);
      await cancelOverlaps('person', 'created_by', ['ACTIVE', 'PENDING']);
      await cancelOverlaps('faculty', 'faculty_id', ['ACTIVE'], 'AND faculty_id IS NOT NULL');

      await client.query(`
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_time_order;
        ALTER TABLE bookings ADD CONSTRAINT bookings_time_order CHECK (end_time > start_time);
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_room_overlap;
        ALTER TABLE bookings ADD CONSTRAINT bookings_no_room_overlap
          EXCLUDE USING gist (room_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status = 'ACTIVE');
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_person_overlap;
        ALTER TABLE bookings ADD CONSTRAINT bookings_no_person_overlap
          EXCLUDE USING gist (created_by WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status IN ('ACTIVE', 'PENDING'));
        ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_faculty_overlap;
        ALTER TABLE bookings ADD CONSTRAINT bookings_no_faculty_overlap
          EXCLUDE USING gist (faculty_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status = 'ACTIVE' AND faculty_id IS NOT NULL);

        -- A timetabled class that does not happen on one specific date (approved class cancellation,
        -- or a class moved by a reschedule booking). Replaces weekly room_availability edits.
        CREATE TABLE IF NOT EXISTS room_slot_releases (
          id SERIAL PRIMARY KEY,
          room_id INTEGER NOT NULL REFERENCES rooms(id),
          release_date DATE NOT NULL,
          start_hour INTEGER NOT NULL CHECK (start_hour BETWEEN 0 AND 23),
          end_hour INTEGER NOT NULL CHECK (end_hour BETWEEN 1 AND 24 AND end_hour > start_hour),
          source_type VARCHAR(32) NOT NULL,
          source_id INTEGER,
          created_by INTEGER REFERENCES users(id),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          deactivated_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_room_slot_releases_lookup ON room_slot_releases(room_id, release_date) WHERE is_active;
      `);
    }
  },
  {
    version: 27,
    name: 'Reschedule bookings remember which timetabled class they replace',
    run: async (client) => {
      await client.query(`
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_room_id INTEGER REFERENCES rooms(id);
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_date DATE;
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reschedule_hour INTEGER CHECK (reschedule_hour BETWEEN 0 AND 23);
      `);
    }
  },
  {
    version: 28,
    name: 'Drop same-start unique indexes superseded by the v26 exclusion constraints',
    run: async (client) => {
      // They made same-start races fail with a generic unique-violation instead of the specific
      // overlap conflict (NEW-P4-8); the exclusion constraints cover every overlap.
      await client.query('DROP INDEX IF EXISTS idx_room_slot_active; DROP INDEX IF EXISTS idx_user_slot_active;');
    }
  },
  {
    version: 29,
    name: 'Transfers: one OPEN request per requester and booking (re-requesting after withdraw/reject allowed)',
    run: async (client) => {
      await client.query(`
        ALTER TABLE booking_transfers DROP CONSTRAINT IF EXISTS booking_transfers_booking_id_requested_by_key;
        CREATE UNIQUE INDEX IF NOT EXISTS booking_transfers_one_open_request
          ON booking_transfers (booking_id, requested_by)
          WHERE status IN ('PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED');
      `);
    }
  },
  {
    version: 30,
    name: 'Indexes for the calendar window and "my bookings" queries (PERF-01)',
    run: async (client) => {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_bookings_open_start ON bookings (start_time) WHERE status IN ('ACTIVE', 'PENDING');
        CREATE INDEX IF NOT EXISTS idx_bookings_created_by_start ON bookings (created_by, start_time DESC);
      `);
    }
  },
  {
    version: 31,
    name: 'room_availability: source + soft delete, so a timetable re-import retires only its own blocks (OPS-05)',
    run: async (client) => {
      await client.query(`
        ALTER TABLE room_availability ADD COLUMN IF NOT EXISTS source VARCHAR(30) NOT NULL DEFAULT 'manual';
        ALTER TABLE room_availability ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
        ALTER TABLE room_availability ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
        -- Blocks written by the timetable import carry no user; manual overrides always record theirs.
        UPDATE room_availability SET source = 'timetable_import'
         WHERE user_id IS NULL AND is_available = FALSE AND day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun');
      `);
    }
  },
  {
    version: 32,
    name: 'Notifications: in-app inbox + email outbox (written in the same transaction as the change)',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id               BIGSERIAL PRIMARY KEY,
          user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
          email            VARCHAR(255),
          type             VARCHAR(50) NOT NULL,
          title            TEXT NOT NULL,
          body             TEXT NOT NULL,
          link             TEXT,
          entity_type      VARCHAR(30),
          entity_id        INTEGER,
          read_at          TIMESTAMPTZ,
          is_active        BOOLEAN NOT NULL DEFAULT TRUE,
          deactivated_at   TIMESTAMPTZ,
          email_status     VARCHAR(12) NOT NULL DEFAULT 'none'
                           CHECK (email_status IN ('none', 'pending', 'sending', 'sent', 'failed', 'logged')),
          email_subject    TEXT,
          email_html       TEXT,
          email_attempts   INTEGER NOT NULL DEFAULT 0,
          email_next_at    TIMESTAMPTZ,
          email_last_error TEXT,
          email_sent_at    TIMESTAMPTZ,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (user_id IS NOT NULL OR email IS NOT NULL)
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON notifications (user_id, created_at DESC) WHERE is_active;
        CREATE INDEX IF NOT EXISTS idx_notifications_inbox_email ON notifications (lower(email), created_at DESC) WHERE is_active AND user_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_notifications_outbox ON notifications (email_next_at) WHERE email_status IN ('pending', 'sending');
      `);
    }
  },
  {
    version: 33,
    name: 'Departments/branches are synced from the college ACL: acl_id keys and updated_at',
    run: async (client) => {
      // (Re-runnable: both tables are dropped later, by v35.)
      const { rows: [t] } = await client.query("SELECT to_regclass('public.departments') IS NOT NULL AS present");
      if (!t.present) return;
      await client.query(`
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS acl_id VARCHAR(100);
        ALTER TABLE departments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
        CREATE UNIQUE INDEX IF NOT EXISTS departments_acl_id_key ON departments (acl_id) WHERE acl_id IS NOT NULL;
        ALTER TABLE branches ADD COLUMN IF NOT EXISTS acl_id VARCHAR(100);
        ALTER TABLE branches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
        CREATE UNIQUE INDEX IF NOT EXISTS branches_acl_id_key ON branches (acl_id) WHERE acl_id IS NOT NULL;
      `);
    }
  },
  {
    version: 34,
    name: 'Retire junk "free" availability rows from the old seeder; case-insensitive unique email',
    run: async (client) => {
      // The old scripts/seed.js wrote is_available=TRUE weekly rows with no author. In the UI an
      // override row skips the timetable check, so these made timetabled slots look free while the
      // server refused them. Real overrides always record their admin (user_id). Soft delete.
      await client.query(`
        UPDATE room_availability SET is_active = FALSE, deactivated_at = NOW()
         WHERE source = 'manual' AND is_available AND user_id IS NULL AND is_active
      `);
      // Sign-in looks people up by lower(email): give that a unique index (was a sequential scan).
      const { rows: [dup] } = await client.query(
        'SELECT lower(email) AS email FROM users GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1',
      );
      if (dup) {
        logger.warn(`Migration v34: users share an email in different case (${dup.email}); adding a non-unique index instead`);
        await client.query('CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))');
      } else {
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email));
          ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
        `);
      }
    }
  },
  {
    version: 35,
    name: 'ACL alignment: drop departments/branches and password-era leftovers',
    run: async (client) => {
      // Department and branch are ACL-provided attributes on users and faculty (decision
      // 2026-10-20); CRAS keeps no master list. Passwords, approval and promotions belong to the
      // ACL; booking_history duplicated audit_logs and was never read.
      await client.query(`
        ALTER TABLE users DROP COLUMN IF EXISTS department_id, DROP COLUMN IF EXISTS branch_id,
          DROP COLUMN IF EXISTS department, DROP COLUMN IF EXISTS password,
          DROP COLUMN IF EXISTS password_reset_token, DROP COLUMN IF EXISTS password_reset_expires,
          DROP COLUMN IF EXISTS is_approved;
        ALTER TABLE faculties DROP COLUMN IF EXISTS department_id;
        ALTER TABLE user_access DROP COLUMN IF EXISTS academic;
        ALTER TABLE bookings DROP COLUMN IF EXISTS is_semester_booking;
        DROP TABLE IF EXISTS branches;
        DROP TABLE IF EXISTS departments;
        DROP TABLE IF EXISTS promotion_requests;
        DROP TABLE IF EXISTS booking_history;
      `);
    }
  },
  {
    version: 36,
    name: 'Timetable normalisation: section keys, minutes, room/faculty ids, soft delete; one availability model',
    run: async (client) => {
      // Re-runnable: every step checks what is already there.
      const colType = async (table, col) => (await client.query(
        'SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2', [table, col],
      )).rows[0]?.data_type;
      const addConstraint = async (table, name, def) => {
        const { rowCount } = await client.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [name]);
        if (!rowCount) await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${def}`);
      };
      const retired = async (label, sql) => {
        const { rowCount } = await client.query(sql);
        if (rowCount) logger.warn(`Migration v36: ${rowCount} ${label} soft-deleted`);
      };
      const WEEKDAYS = "('Mon','Tue','Wed','Thu','Fri','Sat','Sun')";

      // The timetable time rule (utils/timetableLogic.js timetableMinutes), in SQL for the backfill.
      await client.query(String.raw`
        CREATE OR REPLACE FUNCTION pg_temp.tt_minutes(t text) RETURNS integer LANGUAGE sql IMMUTABLE AS $f$
          SELECT CASE WHEN m IS NULL THEN NULL ELSE
            (CASE lower(left(m[3], 1))
               WHEN 'a' THEN m[1]::int % 12
               WHEN 'p' THEN m[1]::int % 12 + 12
               ELSE CASE WHEN m[1]::int BETWEEN 1 AND 7 THEN m[1]::int + 12 ELSE m[1]::int END
             END) * 60 + m[2]::int END
          FROM regexp_match(trim(coalesce(t, '')), '(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?', 'i') AS m
        $f$;
      `);
      const backfillMinutes = (table) => client.query(`
        UPDATE ${table} SET start_min = pg_temp.tt_minutes(split_part(slot_time, '-', 1)),
                            end_min = pg_temp.tt_minutes(NULLIF(split_part(slot_time, '-', 2), ''))
         WHERE start_min IS NULL;
        UPDATE ${table} SET end_min = end_min + 720 WHERE end_min <= start_min;
      `);
      const resolveIds = async (table, { room = true } = {}) => {
        if (room) {
          await client.query(`
            UPDATE ${table} t SET room_id = (SELECT r.id FROM rooms r WHERE lower(trim(r.name)) = lower(trim(t.room_name))
                                                ORDER BY r.is_active DESC, r.id LIMIT 1)
             WHERE t.room_id IS NULL AND coalesce(trim(t.room_name), '') <> ''`);
        }
        await client.query(`
          UPDATE ${table} t SET faculty_id = (SELECT f.id FROM faculties f WHERE upper(trim(f.name)) = upper(trim(t.faculty_name))
                                                 ORDER BY f.is_active DESC, f.id LIMIT 1)
           WHERE t.faculty_id IS NULL AND coalesce(trim(t.faculty_name), '') <> ''`);
      };

      // ── Section timetable ──────────────────────────────────────────────────────────────────
      // Section key = the ACL branch (stored upper-case) + integer semester + integer section.
      // room_name/faculty_name stay as the source labels (many rooms are outside CRAS); matching
      // uses room_id/faculty_id. year/degree/specialization/type were never read.
      await client.query(`
        ALTER TABLE timetable_slots
          ADD COLUMN IF NOT EXISTS start_min INTEGER, ADD COLUMN IF NOT EXISTS end_min INTEGER,
          ADD COLUMN IF NOT EXISTS room_id INTEGER, ADD COLUMN IF NOT EXISTS faculty_id INTEGER,
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
          ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
        DROP INDEX IF EXISTS idx_timetable_slots_section;
      `);
      if (await colType('timetable_slots', 'semester') !== 'integer') {
        await client.query(String.raw`
          ALTER TABLE timetable_slots
            ALTER COLUMN semester TYPE INTEGER USING CASE WHEN trim(semester) ~ '^\d{1,2}$' THEN trim(semester)::int END,
            ALTER COLUMN section TYPE INTEGER USING CASE WHEN trim(section) ~ '^\d{1,2}$' THEN trim(section)::int END`);
      }
      await client.query(`
        ALTER TABLE timetable_slots DROP COLUMN IF EXISTS year, DROP COLUMN IF EXISTS degree,
          DROP COLUMN IF EXISTS specialization, DROP COLUMN IF EXISTS type;
        UPDATE timetable_slots SET department = upper(trim(department)) WHERE department IS DISTINCT FROM upper(trim(department));
      `);
      await backfillMinutes('timetable_slots');
      await resolveIds('timetable_slots');
      await retired('timetable rows with an unreadable time, day or section', `
        UPDATE timetable_slots SET is_active = FALSE, deactivated_at = NOW()
         WHERE is_active AND (start_min IS NULL OR end_min IS NULL OR end_min > 1440 OR end_min <= start_min OR day_of_week NOT IN ${WEEKDAYS}
                              OR semester IS NULL OR section IS NULL OR coalesce(department, '') = '')`);
      // Exact duplicates (same class, room and teacher) collapse to the oldest row.
      const SLOT_KEY = `department, semester, section, day_of_week, start_min, end_min, coalesce(batch, ''),
        coalesce(subject_code, ''), coalesce(subject_name, ''), lower(coalesce(room_name, '')), upper(coalesce(faculty_name, ''))`;
      await retired('duplicate timetable rows', `
        UPDATE timetable_slots SET is_active = FALSE, deactivated_at = NOW()
         WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY ${SLOT_KEY} ORDER BY id) AS n
                                        FROM timetable_slots WHERE is_active) d WHERE n > 1)`);
      await addConstraint('timetable_slots', 'timetable_slots_room_id_fkey', 'FOREIGN KEY (room_id) REFERENCES rooms(id)');
      await addConstraint('timetable_slots', 'timetable_slots_faculty_id_fkey', 'FOREIGN KEY (faculty_id) REFERENCES faculties(id)');
      await addConstraint('timetable_slots', 'timetable_slots_active_valid', `CHECK (NOT is_active OR (
        day_of_week IN ${WEEKDAYS} AND semester IS NOT NULL AND section IS NOT NULL AND department <> ''
        AND start_min BETWEEN 0 AND 1439 AND end_min > start_min AND end_min <= 1440))`);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS timetable_slots_active_key ON timetable_slots (${SLOT_KEY}) WHERE is_active;
        CREATE INDEX IF NOT EXISTS idx_timetable_slots_section ON timetable_slots (department, semester, section, day_of_week) WHERE is_active;
        CREATE INDEX IF NOT EXISTS idx_timetable_slots_room ON timetable_slots (room_id, day_of_week) WHERE is_active;
        CREATE INDEX IF NOT EXISTS idx_timetable_slots_faculty_id ON timetable_slots (faculty_id, day_of_week) WHERE is_active;
      `);

      // ── Faculty timetable slots ────────────────────────────────────────────────────────────
      await client.query(`
        ALTER TABLE faculty_timetable_slots
          ADD COLUMN IF NOT EXISTS faculty_id INTEGER, ADD COLUMN IF NOT EXISTS start_min INTEGER,
          ADD COLUMN IF NOT EXISTS end_min INTEGER;
        DROP INDEX IF EXISTS idx_faculty_tt_day;
        DROP INDEX IF EXISTS idx_faculty_tt_room;
      `);
      await backfillMinutes('faculty_timetable_slots');
      await resolveIds('faculty_timetable_slots', { room: false });
      await retired('faculty timetable slots with an unreadable time or day', `
        UPDATE faculty_timetable_slots SET is_active = FALSE, deactivated_at = NOW()
         WHERE is_active AND (start_min IS NULL OR end_min IS NULL OR end_min > 1440 OR end_min <= start_min OR day_of_week NOT IN ${WEEKDAYS})`);
      await addConstraint('faculty_timetable_slots', 'faculty_timetable_slots_faculty_id_fkey', 'FOREIGN KEY (faculty_id) REFERENCES faculties(id)');
      await addConstraint('faculty_timetable_slots', 'faculty_timetable_slots_active_valid', `CHECK (NOT is_active OR (
        day_of_week IN ${WEEKDAYS} AND start_min BETWEEN 0 AND 1439 AND end_min > start_min AND end_min <= 1440))`);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_faculty_tt_faculty ON faculty_timetable_slots (faculty_id, day_of_week) WHERE is_active;
        CREATE INDEX IF NOT EXISTS idx_faculty_tt_room_day ON faculty_timetable_slots (room_id, day_of_week) WHERE is_active;
      `);

      // ── A faculty member's own-class cancellations: keyed by the directory entry ───────────
      await client.query(`
        ALTER TABLE faculty_slot_overrides
          ADD COLUMN IF NOT EXISTS faculty_id INTEGER, ADD COLUMN IF NOT EXISTS created_by INTEGER,
          ALTER COLUMN faculty_name DROP NOT NULL;
        ALTER TABLE faculty_slot_overrides DROP CONSTRAINT IF EXISTS faculty_slot_overrides_faculty_name_date_hour_key;
      `);
      await resolveIds('faculty_slot_overrides', { room: false });
      await addConstraint('faculty_slot_overrides', 'faculty_slot_overrides_faculty_id_fkey', 'FOREIGN KEY (faculty_id) REFERENCES faculties(id)');
      await addConstraint('faculty_slot_overrides', 'faculty_slot_overrides_created_by_fkey', 'FOREIGN KEY (created_by) REFERENCES users(id)');
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS faculty_slot_overrides_key ON faculty_slot_overrides (faculty_id, date, hour);
      `);

      // ── Class-cancellation requests: the room by id, and who reviewed ──────────────────────
      await client.query(`
        ALTER TABLE class_cancellation_requests
          ADD COLUMN IF NOT EXISTS room_id INTEGER, ADD COLUMN IF NOT EXISTS reviewed_by INTEGER,
          ALTER COLUMN room_name DROP NOT NULL;
        UPDATE class_cancellation_requests c SET room_id = (SELECT r.id FROM rooms r WHERE lower(trim(r.name)) = lower(trim(c.room_name))
                                                              ORDER BY r.is_active DESC, r.id LIMIT 1)
         WHERE c.room_id IS NULL AND c.room_name IS NOT NULL;
        DROP INDEX IF EXISTS idx_pending_cancellation_request;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_cancellation_request
          ON class_cancellation_requests (faculty_id, room_id, class_date, hour) WHERE status = 'PENDING';
      `);
      await addConstraint('class_cancellation_requests', 'class_cancellation_requests_room_id_fkey', 'FOREIGN KEY (room_id) REFERENCES rooms(id)');
      await addConstraint('class_cancellation_requests', 'class_cancellation_requests_reviewed_by_fkey', 'FOREIGN KEY (reviewed_by) REFERENCES users(id)');

      // ── One availability model ─────────────────────────────────────────────────────────────
      // Classes block rooms straight from the timetables (by room_id), on the calendar and in the
      // booking check alike. room_availability holds admin weekly blocks only; dated exceptions are
      // room_slot_releases. Retired (decision 2026-10-20): rows derived from an old occupancy
      // snapshot by the former seeder ('timetable_import'), and "free" rows, which only ever
      // meant "no block here".
      await retired('derived or "free" weekly availability rows', `
        UPDATE room_availability SET is_active = FALSE, deactivated_at = NOW()
         WHERE is_active AND (source = 'timetable_import' OR is_available)`);
      await addConstraint('room_availability', 'room_availability_active_block',
        `CHECK (NOT is_active OR (NOT is_available AND day IN ${WEEKDAYS} AND hour BETWEEN 0 AND 23))`);
      await addConstraint('room_slot_releases', 'room_slot_releases_source_type_check',
        "CHECK (source_type IN ('faculty_override', 'cancellation_request', 'reschedule'))");
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_room_slot_releases_source ON room_slot_releases (source_type, source_id) WHERE is_active;
      `);
    }
  },
  {
    version: 37,
    name: 'Integrity: status/role/type checks, NOT NULL keys, RESTRICT foreign keys, index hygiene',
    run: async (client) => {
      // Re-runnable. A rule that existing rows break is added NOT VALID (new writes are checked) and
      // logged, so a deploy never fails on old data; nothing is rewritten or removed.
      const has = async (name) => (await client.query('SELECT 1 FROM pg_constraint WHERE conname = $1', [name])).rowCount > 0;
      const check = async (table, name, expr) => {
        if (await has(name)) return;
        const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE NOT (${expr})`);
        if (n) logger.warn(`Migration v37: ${n} ${table} row(s) break ${name}; added NOT VALID`);
        await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${expr})${n ? ' NOT VALID' : ''}`);
      };
      const notNull = async (table, column) => {
        const { rows: [{ n }] } = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} IS NULL`);
        if (n) logger.warn(`Migration v37: ${n} ${table}.${column} NULL(s); column left nullable`);
        else await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL`);
      };
      const ROLES = "('VIEWER', 'STUDENT_REP', 'FACULTY', 'ADMIN')";

      await check('bookings', 'bookings_status_check', "status IN ('ACTIVE', 'PENDING', 'CANCELLED', 'REJECTED')");
      await check('booking_transfers', 'booking_transfers_status_check',
        "status IN ('PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED', 'ACCEPTED', 'REJECTED', 'CANCELLED')");
      const { rowCount: hasRoleCol } = await client.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role'");
      if (hasRoleCol) {
        await check('users', 'users_role_check', `role IN ${ROLES}`);
        await client.query("UPDATE users SET role = 'VIEWER' WHERE role IS NULL; ALTER TABLE users ALTER COLUMN role SET DEFAULT 'VIEWER'");
        await notNull('users', 'role');
      }
      await check('user_access', 'user_access_role_check', `role IN ${ROLES}`);
      await check('rooms', 'rooms_type_check', "type IS NULL OR type IN ('Lecture Room', 'Lab', 'Auditorium', 'Committee Room')");
      for (const [table, column] of [['bookings', 'room_id'], ['bookings', 'created_by'], ['bookings', 'status'],
        ['booking_transfers', 'booking_id'], ['booking_transfers', 'owner_id'], ['booking_transfers', 'requested_by'],
        ['booking_transfers', 'status']]) {
        await notNull(table, column);
      }

      // Rows are soft-deleted, never removed: a hard delete of a referenced row must fail loudly
      // instead of cascading through bookings and history (or quietly nulling who did what).
      const { rows: fks } = await client.query(`
        SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def
          FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND confdeltype IN ('c', 'n')`);
      for (const fk of fks) {
        await client.query(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${fk.conname},
          ADD CONSTRAINT ${fk.conname} ${fk.def.replace(/ ON DELETE (CASCADE|SET NULL)/, ' ON DELETE RESTRICT')}`);
      }

      // ACL revocation keeps the snapshot (marked revoked) instead of deleting it.
      await client.query('ALTER TABLE user_access ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ');

      // Room names are unique among active rooms regardless of case (the seeder and the timetable
      // match them case-insensitively).
      const { rows: [dup] } = await client.query(
        'SELECT lower(name) AS name FROM rooms WHERE is_active GROUP BY lower(name) HAVING count(*) > 1 LIMIT 1');
      if (dup) logger.warn(`Migration v37: active rooms share the name "${dup.name}" in different case; kept the exact-case unique index`);
      else {
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS rooms_name_lower_active_key ON rooms (lower(name)) WHERE is_active;
          DROP INDEX IF EXISTS rooms_name_active_key;
        `);
      }

      await client.query(`
        -- Duplicates of a unique index, or of the case-insensitive one.
        DROP INDEX IF EXISTS idx_availability_room_day_hour;
        ALTER TABLE faculties DROP CONSTRAINT IF EXISTS faculties_email_key;
        DROP INDEX IF EXISTS faculties_email_key;
        -- Booleans with two values: never chosen by the planner.
        DROP INDEX IF EXISTS idx_rooms_active, idx_users_active, idx_faculties_active, idx_faculty_timetable_slots_active;
        -- Exact-name index no query uses (searches are ILIKE or upper(trim()), and matching is by id).
        DROP INDEX IF EXISTS idx_faculty_tt_name;
        DROP INDEX IF EXISTS idx_timetable_slots_faculty;
        CREATE INDEX IF NOT EXISTS idx_timetable_slots_faculty_name ON timetable_slots (upper(trim(faculty_name))) WHERE is_active;
        -- The exclusion indexes serve ACTIVE/PENDING lookups; only "PENDING requests for this room
        -- and time" (approval rejects the losers) needs its own, measured on the load database:
        -- 0.29 ms → 0.015 ms, and 600 kB of full-table GiST indexes go.
        CREATE INDEX IF NOT EXISTS idx_bookings_room_pending ON bookings USING gist (room_id, tstzrange(start_time, end_time))
          WHERE status = 'PENDING';
        DROP INDEX IF EXISTS idx_bookings_range_gist, idx_bookings_user_range;
        -- Transfer inboxes: by owner, by requester (newest first), by the faculty asked to approve.
        CREATE INDEX IF NOT EXISTS idx_transfers_owner ON booking_transfers (owner_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_requested_by ON booking_transfers (requested_by, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_transfers_target_faculty ON booking_transfers (target_faculty_id) WHERE target_faculty_id IS NOT NULL;
        -- Notifications that are never emailed keep no rendered email.
        UPDATE notifications SET email_subject = NULL, email_html = NULL
         WHERE email_status = 'none' AND (email_subject IS NOT NULL OR email_html IS NOT NULL);
      `);
    }
  },
  {
    version: 38,
    name: 'Import jobs survive restarts (import_jobs table)',
    run: async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS import_jobs (
          id UUID PRIMARY KEY,
          kind VARCHAR(32) NOT NULL CHECK (kind IN ('faculty', 'timetable')),
          status VARCHAR(16) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
          result JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs (created_at DESC);
      `);
    }
  },
  {
    version: 39,
    name: 'Admin bookings over a class: releases and teacher cancellations tied to the booking',
    run: async (client) => {
      // An admin booking over a timetabled class cancels that class for the date (decision
      // 2026-10-22). The room release and the teacher's "class cancelled" record point at the
      // booking, so cancelling or moving the booking puts the class back.
      await client.query(`
        ALTER TABLE room_slot_releases DROP CONSTRAINT IF EXISTS room_slot_releases_source_type_check;
        ALTER TABLE room_slot_releases ADD CONSTRAINT room_slot_releases_source_type_check
          CHECK (source_type IN ('faculty_override', 'cancellation_request', 'reschedule', 'admin_booking'));
        ALTER TABLE faculty_slot_overrides ADD COLUMN IF NOT EXISTS booking_id INTEGER;
        CREATE INDEX IF NOT EXISTS idx_faculty_slot_overrides_booking ON faculty_slot_overrides (booking_id) WHERE booking_id IS NOT NULL;
      `);
      const { rowCount } = await client.query("SELECT 1 FROM pg_constraint WHERE conname = 'faculty_slot_overrides_booking_id_fkey'");
      if (!rowCount) {
        await client.query(`ALTER TABLE faculty_slot_overrides ADD CONSTRAINT faculty_slot_overrides_booking_id_fkey
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT`);
      }
    }
  },
  {
    version: 40,
    name: 'Drop role column from users table (managed externally via user_access / ACL)',
    run: async (client) => {
      await client.query('ALTER TABLE users DROP COLUMN IF EXISTS role CASCADE');
    }
  }
];


// Arbitrary constant key so concurrent app instances serialise their migration runs.
const MIGRATION_LOCK_KEY = 72_410_001;

/**
 * Applies pending migrations. Each migration and its schema_migrations row commit together
 * in one transaction, and the whole run holds a Postgres advisory lock, so two instances
 * booting at once cannot interleave or double-apply. Throws on failure.
 */
export async function runMigrations() {
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    locked = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255),
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows } = await client.query('SELECT COALESCE(MAX(version), 0) AS current_version FROM schema_migrations');
    const currentVersion = Number(rows[0].current_version);

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue;
      logger.info(`Applying migration v${migration.version}: ${migration.name}`);
      try {
        await client.query('BEGIN');
        await migration.run(client);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration v${migration.version} (${migration.name}) failed: ${err.message}`, { cause: err });
      }
    }
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/** Connects and migrates; resolves true/false instead of throwing (used by tests and scripts). */
export async function testDbConnection() {
  try {
    await runMigrations();
    logger.info('Database connected and migrations synchronized');
    return true;
  } catch (err) {
    logger.error('Database connection failed', err);
    return false;
  }
}

/**
 * Startup helper: retries for cold-starting hosted Postgres (e.g. Neon), then migrates.
 * The server must await this before it starts accepting requests.
 */
export async function connectAndMigrate({ retries = 3, delayMs = 3000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    if (await testDbConnection()) return;
    logger.error(`Database connection attempt ${attempt}/${retries} failed`);
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error('Database connection could not be established after all retries');
}

export { pool };

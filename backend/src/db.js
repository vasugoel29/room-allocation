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
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      const sqlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../sql/schema_v2.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*DROP\s+TABLE/i.test(line))
        .join('\n');
      await client.query(sql);
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

      const countRes = await client.query('SELECT count(*) FROM timetable_slots');
      const count = parseInt(countRes.rows[0].count);

      if (count === 0) {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        const filePath = path.resolve(__dirname, '../../hajiri.timetables.json');
        if (fs.existsSync(filePath)) {
          logger.info('Migration v10: Seeding timetable_slots from hajiri.timetables.json...');
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

          for (const obj of data) {
            const { department, degree, specialization, section, year, semester, timetable } = obj;
            for (const day in timetable) {
              const slots = timetable[day];
              for (const slot of slots) {
                const { time, subjectCode, subjectName, room, type, batch, faculty } = slot;
                await client.query(
                  `INSERT INTO timetable_slots (
                    department, degree, specialization, section, year, semester, 
                    day_of_week, slot_time, subject_code, subject_name, room_name, type, batch, faculty_name
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                  [
                    department, degree, specialization, section, year, semester,
                    day, time, subjectCode, subjectName, room, type, batch, faculty
                  ]
                );
              }
            }
          }
          logger.info('Migration v10: Successfully seeded timetable_slots.');
        } else {
          logger.warn(`Migration v10: Seeding source file not found at ${filePath}. Skipping seeding.`);
        }
      }
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

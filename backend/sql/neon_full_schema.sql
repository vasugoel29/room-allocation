-- ============================================================
-- CRAS Full Schema for Neon PostgreSQL
-- DROP + RECREATE all tables to ensure exact schema match
-- ⚠️ WARNING: This will DELETE all existing data!
-- ============================================================

-- Drop all tables in dependency order
DROP TABLE IF EXISTS schema_migrations CASCADE;
DROP TABLE IF EXISTS faculty_slot_overrides CASCADE;
DROP TABLE IF EXISTS faculty_timetable_slots CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS booking_transfers CASCADE;
DROP TABLE IF EXISTS promotion_requests CASCADE;
DROP TABLE IF EXISTS booking_history CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS room_availability CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ============================================================
-- 1. DEPARTMENTS
-- ============================================================

CREATE TABLE departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL
);

-- Seed default departments
INSERT INTO departments (name) VALUES
  ('Computer Science (CSE)'),
  ('Information Technology (IT)'),
  ('Electronics & Communication (ECE)'),
  ('Electrical Engineering (EE)'),
  ('Mechanical Engineering (ME)'),
  ('Instrumentation & Control (ICE)'),
  ('Biotechnology'),
  ('Mathematics'),
  ('Physics'),
  ('Humanities & Management');


-- ============================================================
-- 2. USERS
-- ============================================================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'VIEWER',
  branch VARCHAR(255),
  year INT CHECK (year BETWEEN 1 AND 5),
  section INT CHECK (section BETWEEN 1 AND 15),
  department VARCHAR(255),
  department_id INTEGER REFERENCES departments(id),
  department_name VARCHAR(255),
  is_approved BOOLEAN DEFAULT TRUE,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  degree VARCHAR(255),
  roll_no VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 3. ROOMS
-- ============================================================

CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(32) UNIQUE NOT NULL,
  building VARCHAR(255),
  floor INT,
  capacity INT DEFAULT 30,
  has_ac BOOLEAN DEFAULT FALSE,
  has_projector BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rooms_filters ON rooms (capacity, has_ac, has_projector);


-- ============================================================
-- 4. ROOM AVAILABILITY
-- ============================================================

CREATE TABLE room_availability (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  day VARCHAR(20) NOT NULL,
  hour INTEGER NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(room_id, day, hour)
);

CREATE INDEX idx_availability_room_day_hour ON room_availability (room_id, day, hour);
CREATE INDEX idx_availability_user_id ON room_availability (user_id);


-- ============================================================
-- 5. BOOKINGS
-- ============================================================

CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  is_semester_booking BOOLEAN DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- One user → one room per slot (ACTIVE only)
CREATE UNIQUE INDEX idx_user_slot_active ON bookings (created_by, start_time)
WHERE status = 'ACTIVE';

-- One room → one booking per slot (ACTIVE only)
CREATE UNIQUE INDEX idx_room_slot_active ON bookings (room_id, start_time)
WHERE status = 'ACTIVE';

-- GIST indexes for overlap checks
CREATE INDEX idx_bookings_range_gist ON bookings USING GIST (room_id, tstzrange(start_time, end_time));
CREATE INDEX idx_bookings_user_range ON bookings USING GIST (created_by, tstzrange(start_time, end_time));


-- ============================================================
-- 6. BOOKING HISTORY
-- ============================================================

CREATE TABLE booking_history (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  previous_start_time TIMESTAMPTZ,
  previous_end_time TIMESTAMPTZ,
  previous_room_id INTEGER REFERENCES rooms(id),
  modified_by INTEGER REFERENCES users(id),
  change_type VARCHAR(50),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 7. PROMOTION REQUESTS
-- ============================================================

CREATE TABLE promotion_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'PENDING',
  reason TEXT,
  admin_comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, status)
);


-- ============================================================
-- 8. BOOKING TRANSFERS
-- ============================================================

CREATE TABLE booking_transfers (
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


-- ============================================================
-- 9. AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created ON audit_logs(created_at);


-- ============================================================
-- 10. FACULTY TIMETABLE SLOTS
-- ============================================================

CREATE TABLE faculty_timetable_slots (
  id SERIAL PRIMARY KEY,
  faculty_name VARCHAR(255) NOT NULL,
  semester VARCHAR(20),
  day_of_week VARCHAR(20) NOT NULL,
  slot_time VARCHAR(50) NOT NULL,
  content TEXT,
  is_occupied BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_faculty_tt_name ON faculty_timetable_slots(faculty_name);
CREATE INDEX idx_faculty_tt_day ON faculty_timetable_slots(day_of_week);


-- ============================================================
-- 11. FACULTY SLOT OVERRIDES
-- ============================================================

CREATE TABLE faculty_slot_overrides (
  id SERIAL PRIMARY KEY,
  faculty_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  hour INTEGER NOT NULL,
  is_cancelled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(faculty_name, date, hour)
);

CREATE INDEX idx_faculty_override_date ON faculty_slot_overrides(date);


-- ============================================================
-- 12. MIGRATION TRACKER (marks all migrations as applied)
-- ============================================================

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(255),
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO schema_migrations (version, name) VALUES
  (1, 'Initial Schema'),
  (2, 'Promotions and Departments'),
  (3, 'Transfers and Constraints'),
  (4, 'Performance and Availability Updates'),
  (5, 'Auth and Seed Data'),
  (6, 'Audit Logs (PROD-06)'),
  (7, 'Faculty Timetable'),
  (8, 'Faculty Slot Overrides'),
  (9, 'Additional Student Seeding Columns');

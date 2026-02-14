-- CRAS Phase 2 - Database Schema

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'VIEWER',
  year INT CHECK (year BETWEEN 1 AND 4),
  section INT CHECK (section BETWEEN 1 AND 4),
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

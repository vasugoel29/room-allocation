CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- for fast ILIKE/name search

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
CREATE TYPE user_role      AS ENUM ('ADMIN', 'FACULTY', 'STUDENT_REP', 'VIEWER');
CREATE TYPE booking_status AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE room_type      AS ENUM ('Lecture Room', 'Committee Room', 'Auditorium', 'Lab');
CREATE TYPE change_type    AS ENUM ('RESCHEDULE', 'CANCEL');
CREATE TYPE request_type   AS ENUM ('BOOKING', 'CANCELLATION', 'TRANSFER', 'PROMOTION');

-- Postgres has no built-in range type over plain TIME
CREATE TYPE timerange AS RANGE (subtype = time);

-- ---------------------------------------------------------------------
-- Reusable trigger: keep updated_at accurate
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. Org structure
-- =====================================================================
CREATE TABLE departments (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
  id            SERIAL PRIMARY KEY,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  name          VARCHAR(100) NOT NULL,
  short_code    VARCHAR(20),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, department_id)
);
CREATE INDEX idx_branches_dept ON branches(department_id);

-- =====================================================================
-- 2. Users
-- =====================================================================
CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'VIEWER',
  is_approved     BOOLEAN NOT NULL DEFAULT TRUE,

  department_id   INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,

  -- student-only fields
  degree          VARCHAR(100),
  roll_no         VARCHAR(50),
  year            INTEGER CHECK (year BETWEEN 1 AND 5),
  semester        INTEGER CHECK (semester BETWEEN 1 AND 10),
  section         INTEGER CHECK (section BETWEEN 1 AND 20),
  group_name      VARCHAR(50),

  password_reset_token   VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_name_trgm ON users USING GIN (name gin_trgm_ops);

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce: only students carry student-scoped fields
CREATE OR REPLACE FUNCTION enforce_role_scoped_fields() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role NOT IN ('VIEWER', 'STUDENT_REP') THEN
    NEW.branch_id := NULL;
    NEW.year := NULL;
    NEW.semester := NULL;
    NEW.section := NULL;
    NEW.group_name := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_role_scope BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION enforce_role_scoped_fields();

-- =====================================================================
-- 3. Rooms & Subjects
-- =====================================================================
CREATE TABLE rooms (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(32) UNIQUE NOT NULL,
  building       VARCHAR(255),
  floor          INTEGER,
  capacity       INTEGER NOT NULL DEFAULT 30,
  has_ac         BOOLEAN NOT NULL DEFAULT FALSE,
  has_projector  BOOLEAN NOT NULL DEFAULT FALSE,
  type           room_type NOT NULL DEFAULT 'Lecture Room',
  description    TEXT,
  student_access BOOLEAN NOT NULL DEFAULT TRUE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rooms_search ON rooms (capacity, has_ac, has_projector)
  WHERE is_active AND student_access;

CREATE TABLE subjects (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(50) UNIQUE NOT NULL,
  name          VARCHAR(255) NOT NULL,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL
);

-- =====================================================================
-- 4. Canonical timetable
-- =====================================================================
CREATE TABLE timetable_slots (
  id           SERIAL PRIMARY KEY,
  branch_id    INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  semester     INTEGER NOT NULL,
  section      VARCHAR(10),
  batch        VARCHAR(20),
  day_of_week  VARCHAR(10) NOT NULL, -- 'MON'..'SUN'
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL CHECK (end_time > start_time),
  subject_id   INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  room_id      INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  faculty_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type         VARCHAR(20) DEFAULT 'Lecture',
  created_at   TIMESTAMPTZ DEFAULT NOW(),

  EXCLUDE USING GIST (
    room_id WITH =,
    day_of_week WITH =,
    timerange(start_time, end_time) WITH &&
  ) WHERE (room_id IS NOT NULL),

  EXCLUDE USING GIST (
    faculty_id WITH =,
    day_of_week WITH =,
    timerange(start_time, end_time) WITH &&
  ) WHERE (faculty_id IS NOT NULL)
);
CREATE INDEX idx_timetable_faculty ON timetable_slots(faculty_id, day_of_week, start_time);
CREATE INDEX idx_timetable_room ON timetable_slots(room_id, day_of_week, start_time);
CREATE INDEX idx_timetable_branch_sem ON timetable_slots(branch_id, semester, section);

CREATE TABLE timetable_slot_overrides (
  id                SERIAL PRIMARY KEY,
  timetable_slot_id INTEGER NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  override_date     DATE NOT NULL,
  is_cancelled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (timetable_slot_id, override_date)
);
CREATE INDEX idx_slot_overrides_date ON timetable_slot_overrides(override_date);

-- =====================================================================
-- 5. Bookings
-- =====================================================================
CREATE TABLE bookings (
  id           SERIAL PRIMARY KEY,
  room_id      INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),
  purpose      TEXT,
  status       booking_status NOT NULL DEFAULT 'ACTIVE',
  cancelled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),

  EXCLUDE USING GIST (
    room_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'ACTIVE'),

  EXCLUDE USING GIST (
    created_by WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'ACTIVE')
);
CREATE INDEX idx_bookings_room_range_gist ON bookings USING GIST (room_id, tstzrange(start_time, end_time));
CREATE INDEX idx_bookings_user_range_gist ON bookings USING GIST (created_by, tstzrange(start_time, end_time));

CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_history (
  id                  SERIAL PRIMARY KEY,
  booking_id          INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
  previous_start_time TIMESTAMPTZ,
  previous_end_time   TIMESTAMPTZ,
  previous_room_id    INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  modified_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  change_type         change_type NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_booking_history_booking ON booking_history(booking_id);

-- =====================================================================
-- 6. Approval workflow
-- =====================================================================
CREATE TABLE requests (
  id            SERIAL PRIMARY KEY,
  request_type  request_type NOT NULL,
  requested_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        request_status NOT NULL DEFAULT 'PENDING',
  reason        TEXT,
  reviewed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  admin_comment TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_requests_type_status ON requests(request_type, status);
CREATE INDEX idx_requests_requester ON requests(requested_by, status);
CREATE INDEX idx_requests_reviewer ON requests(reviewed_by, status);

CREATE TRIGGER trg_requests_updated_at BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION set_reviewed_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != 'PENDING' AND OLD.status = 'PENDING' THEN
    NEW.reviewed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requests_reviewed_at BEFORE UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION set_reviewed_at();

CREATE UNIQUE INDEX idx_one_pending_promotion
  ON requests(requested_by)
  WHERE request_type = 'PROMOTION' AND status = 'PENDING';

-- Detail tables
CREATE TABLE booking_requests (
  request_id          INTEGER PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  room_id             INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL CHECK (end_time > start_time),
  purpose             TEXT,
  resulting_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL
);
CREATE INDEX idx_booking_requests_room_time
  ON booking_requests USING GIST (room_id, tstzrange(start_time, end_time));

CREATE TABLE transfer_requests (
  request_id        INTEGER PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  booking_id        INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  owner_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  new_purpose       TEXT,
  status            VARCHAR(20) DEFAULT 'PENDING'
);
CREATE INDEX idx_transfer_requests_owner ON transfer_requests(owner_id);
CREATE INDEX idx_transfer_requests_target ON transfer_requests(target_faculty_id);

CREATE OR REPLACE FUNCTION check_one_pending_transfer() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transfer_requests tr
    JOIN requests r ON r.id = tr.request_id
    WHERE tr.booking_id = NEW.booking_id
      AND r.requested_by = (SELECT requested_by FROM requests WHERE id = NEW.request_id)
      AND r.status = 'PENDING'
      AND tr.request_id != NEW.request_id
  ) THEN
    RAISE EXCEPTION 'A pending transfer request already exists for this booking';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_one_pending_transfer BEFORE INSERT ON transfer_requests
  FOR EACH ROW EXECUTE FUNCTION check_one_pending_transfer();

CREATE TABLE cancellation_requests (
  request_id          INTEGER PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  faculty_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timetable_slot_id   INTEGER NOT NULL REFERENCES timetable_slots(id) ON DELETE CASCADE,
  class_date          DATE NOT NULL,
  resulting_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL
);
CREATE INDEX idx_cancellation_faculty ON cancellation_requests(faculty_id);

CREATE OR REPLACE FUNCTION check_one_pending_cancellation() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cancellation_requests cr
    JOIN requests r ON r.id = cr.request_id
    WHERE cr.timetable_slot_id = NEW.timetable_slot_id
      AND cr.class_date = NEW.class_date
      AND r.status = 'PENDING'
      AND cr.request_id != NEW.request_id
  ) THEN
    RAISE EXCEPTION 'A pending cancellation request already exists for this class on this date';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_one_pending_cancellation BEFORE INSERT ON cancellation_requests
  FOR EACH ROW EXECUTE FUNCTION check_one_pending_cancellation();

CREATE TABLE promotion_requests (
  request_id     INTEGER PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
  requested_role user_role NOT NULL
);

-- =====================================================================
-- 7. Audit
-- =====================================================================
CREATE TABLE audit_logs (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- =====================================================================
-- 8. Views & Functions
-- =====================================================================
CREATE VIEW faculty_schedule AS
SELECT
  ts.id AS timetable_slot_id,
  u.id AS faculty_id,
  u.name AS faculty_name,
  ts.day_of_week,
  ts.start_time,
  ts.end_time,
  ts.room_id,
  r.name AS room_name,
  s.name AS subject_name,
  COALESCE(o.is_cancelled, FALSE) AS cancelled_today,
  o.override_date
FROM timetable_slots ts
JOIN users u ON u.id = ts.faculty_id
LEFT JOIN rooms r ON r.id = ts.room_id
LEFT JOIN subjects s ON s.id = ts.subject_id
LEFT JOIN timetable_slot_overrides o
  ON o.timetable_slot_id = ts.id AND o.override_date = CURRENT_DATE;

CREATE OR REPLACE FUNCTION room_is_available(
  p_room_id   INTEGER,
  p_start     TIMESTAMPTZ,
  p_end       TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
  p_day VARCHAR(10);
BEGIN
  p_day := UPPER(TO_CHAR(p_start, 'DY')); -- e.g. 'MON'

  -- Blocked by an ad-hoc booking?
  IF EXISTS (
    SELECT 1 FROM bookings
    WHERE room_id = p_room_id
      AND status = 'ACTIVE'
      AND tstzrange(start_time, end_time) && tstzrange(p_start, p_end)
  ) THEN
    RETURN FALSE;
  END IF;

  -- Blocked by a scheduled, non-cancelled class on that weekday?
  IF EXISTS (
    SELECT 1 FROM timetable_slots ts
    WHERE ts.room_id = p_room_id
      AND ts.day_of_week = p_day
      AND timerange(ts.start_time, ts.end_time)
          && timerange(p_start::TIME, p_end::TIME)
      AND NOT EXISTS (
        SELECT 1 FROM timetable_slot_overrides o
        WHERE o.timetable_slot_id = ts.id
          AND o.override_date = p_start::DATE
          AND o.is_cancelled
      )
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE VIEW room_occupancy_today AS
SELECT room_id, start_time, end_time, 'BOOKING' AS source, id AS source_id
FROM bookings
WHERE status = 'ACTIVE'
  AND start_time::DATE = CURRENT_DATE
UNION ALL
SELECT
  ts.room_id,
  (CURRENT_DATE + ts.start_time)::TIMESTAMPTZ AS start_time,
  (CURRENT_DATE + ts.end_time)::TIMESTAMPTZ AS end_time,
  'TIMETABLE' AS source,
  ts.id AS source_id
FROM timetable_slots ts
WHERE ts.day_of_week = UPPER(TO_CHAR(CURRENT_DATE, 'DY'))
  AND NOT EXISTS (
    SELECT 1 FROM timetable_slot_overrides o
    WHERE o.timetable_slot_id = ts.id
      AND o.override_date = CURRENT_DATE
      AND o.is_cancelled
  );

-- =====================================================================
-- 9. Migration bookkeeping table
-- =====================================================================
CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       VARCHAR(255),
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Columns/objects the application code relies on that neither sql/schema_v2.sql nor the
-- migrations in src/db.js create. A fresh deployment is broken until these get a real migration.
-- Applied by test/global-setup.js so the rest of the suite can exercise the code.

-- DRIFT-1: bookingRepository.create() inserts bookings.faculty_id (supervising faculty).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_faculty ON bookings(faculty_id);

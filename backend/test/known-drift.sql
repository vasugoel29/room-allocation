-- Columns/objects the application code relies on that neither sql/schema_v2.sql nor the
-- migrations in src/db.js create. A fresh deployment is broken until these get a real migration.
-- Applied by test/global-setup.js so the rest of the suite can exercise the code.
--
-- Currently empty: DRIFT-01 (bookings.faculty_id) is created by schema_v2.sql and re-pointed at
-- the faculty directory by migration v23.
SELECT 1;

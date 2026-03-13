-- CRAS Phase 3 - Database Indexing & Performance

-- Enable btree_gist extension for cross-type exclusion/range indexing
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Index rooms for capacity and facility filters (Commonly used in room search)
CREATE INDEX IF NOT EXISTS idx_rooms_filters ON rooms (capacity, has_ac, has_projector);

-- 2. GIST index for overlapping time range checks in bookings
-- This significantly speeds up the tstzrange (&&) overlap query used in availability checks and booking conflicts
CREATE INDEX IF NOT EXISTS idx_bookings_range_gist ON bookings USING GIST (room_id, tstzrange(start_time, end_time));

-- 3. Composite index for user conflict checks
CREATE INDEX IF NOT EXISTS idx_bookings_user_range ON bookings USING GIST (created_by, tstzrange(start_time, end_time));

-- 4. Index room_availability for frequent schedule lookups
CREATE INDEX IF NOT EXISTS idx_availability_room_day_hour ON room_availability (room_id, day, hour);

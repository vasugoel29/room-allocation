-- Migration: Alter users table to make year and section INT with CHECK constraints (1-4)
ALTER TABLE users 
  ALTER COLUMN year TYPE INT USING year::integer,
  ALTER COLUMN section TYPE INT USING section::integer;

ALTER TABLE users 
  ADD CONSTRAINT year_range CHECK (year BETWEEN 1 AND 4),
  ADD CONSTRAINT section_range CHECK (section BETWEEN 1 AND 4);

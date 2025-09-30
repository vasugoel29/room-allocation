-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  room_id VARCHAR(32) UNIQUE NOT NULL,
  features TEXT[] NOT NULL
);

-- Create slots table
CREATE TABLE IF NOT EXISTS slots (
  id SERIAL PRIMARY KEY,
  slot VARCHAR(32) UNIQUE NOT NULL
);

-- Create days table
CREATE TABLE IF NOT EXISTS days (
  id SERIAL PRIMARY KEY,
  day VARCHAR(8) UNIQUE NOT NULL
);

-- Create availability table
CREATE TABLE IF NOT EXISTS availability (
  id SERIAL PRIMARY KEY,
  day VARCHAR(8) NOT NULL,
  slot VARCHAR(32) NOT NULL,
  room_id VARCHAR(32) NOT NULL,
  UNIQUE(day, slot, room_id)
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  slot VARCHAR(32) NOT NULL,
  room_id VARCHAR(32) NOT NULL
);

-- Create users table for login
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'student',
  branch VARCHAR(64),
  year INT CHECK (year BETWEEN 1 AND 4),
  section INT CHECK (section BETWEEN 1 AND 4)
);
-- Insert a test user (email: test@example.com, password: test123)
INSERT INTO users (email, password, role) VALUES ('test@example.com', 'test123', 'student') ON CONFLICT DO NOTHING;
INSERT INTO users (email, password, role) VALUES ('Admin@nsut.ac.in', '$2b$10$tkqRJdAIICXjF.G/iKpceO56/Hzi5PUCFRTQLKBUIqsBa.gO4rJpK', 'admin') ON CONFLICT DO NOTHING;
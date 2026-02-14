// db.js
// Handles PostgreSQL connection using node-postgres (pg)
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

export const query = (text, params) => pool.query(text, params);
export { pool };

// db.cjs
// Handles PostgreSQL connection using node-postgres (pg)
const { Pool } = require('pg');

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};

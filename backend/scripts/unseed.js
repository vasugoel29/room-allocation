import pkg from 'pg';
const { Pool } = pkg;
import '../src/config/env.js';
import { assertLocalDatabase } from './lib/guard.js';

assertLocalDatabase(process.env.DATABASE_URL, 'unseed.js');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

async function unseed() {
  console.log('Unseeding database (cleaning all room and booking data)...');
  
  try {
    await pool.query('DELETE FROM booking_transfers');
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM room_availability');
    await pool.query("DELETE FROM users WHERE role <> 'ADMIN'"); // Keep admins (roles are stored upper-case)
    await pool.query('DELETE FROM rooms');
    
    console.log('Database successfully cleaned.');
  } catch (err) {
    console.error('Unseeding failed:', err);
  } finally {
    await pool.end();
  }
}

unseed();

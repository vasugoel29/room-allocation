const { Pool } = require('pg');

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

async function unseed() {
  console.log('Unseeding database (cleaning all room and booking data)...');
  
  try {
    // Note: The order matters because of foreign key constraints
    await pool.query('DELETE FROM booking_history');
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM room_availability');
    await pool.query('DELETE FROM rooms');
    
    // We keep 'users' as they are core to the system, 
    // but you could also delete non-admin users if desired:
    // await pool.query("DELETE FROM users WHERE role != 'STUDENT_REP'");

    console.log('Database successfully cleaned.');
  } catch (err) {
    console.error('Unseeding failed:', err);
  } finally {
    await pool.end();
  }
}

unseed();

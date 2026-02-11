const { Pool } = require('pg');

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

async function seed() {
  console.log('Starting heavy random seeding (High Occupancy + Initial Availability)...');
  
  try {
    // Clear existing
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM room_availability');
    
    const roomsRes = await pool.query('SELECT id FROM rooms');
    const usersRes = await pool.query('SELECT id FROM users');
    
    const roomIds = roomsRes.rows.map(r => r.id);
    const userIds = usersRes.rows.map(u => u.id);
    
    if (roomIds.length === 0 || userIds.length === 0) {
      console.error('No rooms or users found.');
      return;
    }

    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    const PURPOSES = ['Lecture', 'Lab', 'Meeting', 'Exam', 'Study', 'Seminar'];

    const now = new Date();
    const currentDay = now.getDay() || 7;
    
    let bookingCount = 0;
    let availabilityCount = 0;

    for (const dayStr of DAYS) {
      const dayMap = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const targetDay = dayMap[dayStr];
      const diff = targetDay - currentDay;
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + diff);

      for (const hour of HOURS) {
        // 1. Seed Initial Availability (University Schedule)
        // Scarce availability: Only 20% chance a room is "Available" according to Uni
        for (const roomId of roomIds) {
          const isAvailable = Math.random() < 0.2; 
          await pool.query(
            'INSERT INTO room_availability (room_id, day, hour, is_available) VALUES ($1, $2, $3, $4)',
            [roomId, dayStr, hour, isAvailable]
          );
          availabilityCount++;

          // 2. Seed Bookings ONLY for Available rooms
          // If available, high chance it's already booked (High demand)
          if (isAvailable && Math.random() < 0.7) {
            const userId = userIds[Math.floor(Math.random() * userIds.length)];
            const purpose = PURPOSES[Math.floor(Math.random() * PURPOSES.length)];
            
            const start = new Date(targetDate);
            start.setHours(hour, 0, 0, 0);
            const end = new Date(targetDate);
            end.setHours(hour + 1, 0, 0, 0);

            await pool.query(
              'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose) VALUES ($1, $2, $3, $4, $5)',
              [roomId, start.toISOString(), end.toISOString(), userId, purpose]
            );
            bookingCount++;
          }
        }
      }
    }

    console.log(`Seeded ${availabilityCount} availability slots and ${bookingCount} bookings!`);
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await pool.end();
  }
}

seed();

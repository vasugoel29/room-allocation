const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

async function seed() {
  console.log('Starting heavy random seeding (High Occupancy)...');
  
  try {
    // Clear existing bookings
    await pool.query('DELETE FROM bookings');
    
    // Get rooms and users
    const roomsRes = await pool.query('SELECT id FROM rooms');
    const usersRes = await pool.query('SELECT id FROM users');
    
    const roomIds = roomsRes.rows.map(r => r.id);
    const userIds = usersRes.rows.map(u => u.id);
    
    if (roomIds.length === 0 || userIds.length === 0) {
      console.error('No rooms or users found. Please run initial migrations first.');
      return;
    }

    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    const PURPOSES = [
      'Core Lecture', 'Lab Session', 'Department Meeting', 
      'Guest Speaker', 'Final Exam', 'Seminar', 'Project Review',
      'Advanced Calculus', 'Digital Circuits', 'Operating Systems',
      'Physics Lab', 'Staff Meeting', 'Interview Cycle'
    ];

    const now = new Date();
    const currentDay = now.getDay() || 7;
    
    let count = 0;
    for (const dayStr of DAYS) {
      const dayMap = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
      const targetDay = dayMap[dayStr];
      const diff = targetDay - currentDay;
      
      const targetDate = new Date();
      targetDate.setDate(now.getDate() + diff);

      for (const hour of HOURS) {
        // High occupancy: 80% chance that multiple rooms are booked
        if (Math.random() < 0.9) {
          // Book 60% - 90% of available rooms in this slot
          const occupancyRate = 0.6 + (Math.random() * 0.3);
          const numToBook = Math.floor(roomIds.length * occupancyRate);
          
          const shuffledRooms = [...roomIds].sort(() => 0.5 - Math.random());
          const selectedRooms = shuffledRooms.slice(0, numToBook);

          for (const roomId of selectedRooms) {
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
            count++;
          }
        }
      }
    }

    console.log(`Successfully seeded ${count} pre-existing bookings (High Occupancy)!`);
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await pool.end();
  }
}

seed();

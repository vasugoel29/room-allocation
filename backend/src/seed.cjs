const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: 'roomuser',
  host: 'localhost',
  database: 'roomdb',
  password: 'roompass',
  port: 5432,
});

async function seed() {
  console.log('Starting Real Data Seeding (from scraper JSON)...');
  
  try {
    const dataPath = path.join(__dirname, '..', 'rooms_complete_data.json');
    if (!fs.existsSync(dataPath)) {
      console.error('Data file not found at:', dataPath);
      return;
    }
    
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const universityData = JSON.parse(rawData);
    
    // Clear everything
    await pool.query('DELETE FROM bookings');
    await pool.query('DELETE FROM room_availability');
    await pool.query('DELETE FROM rooms');
    
    // Get users for dummy bookings later
    const usersRes = await pool.query('SELECT id FROM users');
    const userIds = usersRes.rows.map(u => u.id);

    const DAYS_MAP = {
      'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
    };

    let roomsInserted = 0;
    let availabilityInserted = 0;
    
    for (const roomObj of universityData.rooms) {
      // 1. Insert Room
      const roomName = roomObj.room; // e.g. "5000", "5102"
      const building = '5th Block';
      // Floor is the second digit of the name (e.g. 50xx -> Floor 0, 51xx -> Floor 1)
      const floor = parseInt(roomName.charAt(1)) || 0;
      
      // Assign realistic random attributes since JSON doesn't have them
      const capacity = [30, 40, 60, 80, 100, 120][Math.floor(Math.random() * 6)];
      const hasAc = Math.random() < 0.4;
      const hasProjector = Math.random() < 0.7;
      
      const newRoom = await pool.query(
        'INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [roomName, building, floor, capacity, hasAc, hasProjector]
      );
      const roomId = newRoom.rows[0].id;
      roomsInserted++;

      // 2. Process Schedule
      for (const [dayStr, slots] of Object.entries(roomObj.schedule)) {
        if (!DAYS_MAP[dayStr]) continue;

        for (const slot of slots) {
          // Parse "T108:00-09:00" -> hour 8
          // The JSON slots are like T1, T2, ... T13
          const hourMatch = slot.time_slot.match(/T\d+(\d{2}):00/);
          if (!hourMatch) continue;
          const hour = parseInt(hourMatch[1]);
          
          if (hour < 8 || hour > 17) continue; // Only keep standard calendar hours

          // Standard university classes make a room UNAVAILABLE for user booking
          const isAvailable = !slot.is_occupied;
          
          await pool.query(
            `INSERT INTO room_availability (room_id, day, hour, is_available) 
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (room_id, day, hour) 
             DO UPDATE SET is_available = room_availability.is_available AND EXCLUDED.is_available`,
            [roomId, dayStr, hour, isAvailable]
          );
          availabilityInserted++;
        }
      }
    }

    console.log(`Seeded ${roomsInserted} real rooms and ${availabilityInserted} availability records!`);
    
    // 3. Add random simulation bookings for FREE slots to show active system
    console.log('Simulating existing user bookings on free slots...');
    let bookingCount = 0;
    const now = new Date();
    const currentDay = now.getDay() || 7;

    const freeSlotsRes = await pool.query('SELECT * FROM room_availability WHERE is_available = TRUE');
    const PURPOSES = ['Study Group', 'Project Collab', 'Club Activity', 'Mock Interview', 'Peer Reading'];

    const usedUserSlots = new Set();

    for (const slot of freeSlotsRes.rows) {
      if (Math.random() < 0.25) { // 25% of truly free slots already booked by students
        const userId = userIds[Math.floor(Math.random() * userIds.length)];
        const targetDay = DAYS_MAP[slot.day];
        const diff = targetDay - currentDay;
        const targetDate = new Date();
        targetDate.setDate(now.getDate() + diff);
        
        const start = new Date(targetDate);
        start.setHours(slot.hour, 0, 0, 0);
        const end = new Date(targetDate);
        end.setHours(slot.hour + 1, 0, 0, 0);

        const slotKey = `${userId}-${start.toISOString()}`;
        if (usedUserSlots.has(slotKey)) continue;
        usedUserSlots.add(slotKey);

        await pool.query(
          'INSERT INTO bookings (room_id, start_time, end_time, created_by, purpose) VALUES ($1, $2, $3, $4, $5)',
          [slot.room_id, start.toISOString(), end.toISOString(), userId, PURPOSES[Math.floor(Math.random() * PURPOSES.length)]]
        );
        bookingCount++;
      }
    }
    console.log(`Successfully added ${bookingCount} simulation bookings.`);

  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await pool.end();
  }
}

seed();

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './src/config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

const DAYS_MAP = {
  'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
};

async function seedBlock8() {
  const client = await pool.connect();
  const dataPath = path.join(__dirname, 'Block_8_rooms_complete_data.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found at: ${dataPath}`);
    process.exit(1);
  }

  try {
    console.log('--- Phase 1: Cleaning 8th Block History ---');
    // We only clean the building specific entries to preserve other blocks
    await client.query('BEGIN');
    
    // 1. Find rooms to delete schedules for (to be safe with foreign keys)
    const { rows: roomsToDel } = await client.query("SELECT id FROM rooms WHERE building = '8th Block'");
    const roomIds = roomsToDel.map(r => r.id);
    
    if (roomIds.length > 0) {
        console.log(`Removing existing data for ${roomIds.length} Block 8 rooms...`);
        await client.query('DELETE FROM room_availability WHERE room_id = ANY($1)', [roomIds]);
        await client.query('DELETE FROM rooms WHERE id = ANY($1)', [roomIds]);
    }
    
    await client.query('COMMIT');
    console.log('Cleanup complete.');

    console.log(`--- Phase 2: Seeding from ${dataPath} ---`);
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const universityData = JSON.parse(rawData);
    const rooms = universityData.rooms;

    for (const roomObj of rooms) {
      const roomName = roomObj.room;
      const floor = parseInt(roomName.charAt(1)) || 0;
      const capacity = [40, 60, 80, 100, 120][Math.floor(Math.random() * 5)];

      // Force Smart Room status for Block 8
      const hasAc = true;
      const hasProjector = true;

      // 1. Insert Room
      const roomRes = await client.query(
        `INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector) 
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [roomName, '8th Block', floor, capacity, hasAc, hasProjector]
      );
      const roomId = roomRes.rows[0].id;

      // 2. Process availability
      const availabilityValues = [];
      const availabilityParams = [];
      let paramIndex = 1;

      const seenSlots = new Set();
      for (const [dayStr, slots] of Object.entries(roomObj.schedule)) {
        if (!DAYS_MAP[dayStr]) continue;
        for (const slot of slots) {
          const hourMatch = slot.time_slot.match(/T\d+(\d{2}):00/);
          if (!hourMatch) continue;
          let hour = parseInt(hourMatch[1]);
          if (hour < 8) hour += 12;
          if (hour < 8 || hour > 20) continue;

          const slotKey = `${dayStr}-${hour}`;
          if (seenSlots.has(slotKey)) continue;
          seenSlots.add(slotKey);
          
          availabilityValues.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
          availabilityParams.push(roomId, dayStr, hour, !slot.is_occupied);
          paramIndex += 4;
        }
      }

      if (availabilityValues.length > 0) {
        await client.query(`
          INSERT INTO room_availability (room_id, day, hour, is_available)
          VALUES ${availabilityValues.join(', ')}
        `, availabilityParams);
      }
    }

    console.log(`Successfully seeded ${rooms.length} Block 8 rooms and set as Smart Spaces.`);
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedBlock8();

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';



const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

const DAYS_MAP = {
  'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
};

function getBuildingAndFloor(roomName) {
  if (roomName.startsWith('APJ')) {
    return { building: 'APJ Block', floor: parseInt(roomName.replace('APJ', '').charAt(0)) || 0 };
  }
  const firstDigit = roomName.charAt(0);
  const floorDigit = roomName.charAt(1);
  const floor = parseInt(floorDigit) || 0;
  
  let building = 'Other';
  if (firstDigit === '4') building = '4th Block';
  else if (firstDigit === '5') building = '5th Block';
  else if (firstDigit === '6') building = '6th Block';
  else if (firstDigit === '8') building = '8th Block';
  
  return { building, floor };
}

async function seedDepartments(client) {
  const departments = [
    'Computer Science (CSE)', 
    'Information Technology (IT)', 
    'Electronics & Communication (ECE)',
    'Electrical Engineering (EE)',
    'Mechanical Engineering (ME)',
    'Instrumentation & Control (ICE)',
    'Biotechnology',
    'Mathematics',
    'Physics',
    'Humanities & Management'
  ];

  console.log('Seeding departments...');
  for (const dept of departments) {
    await client.query(
      'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
      [dept]
    );
  }
}

async function seed() {
  const client = await pool.connect();
  // Point directly to the master scraper output
  const dataPath = '/Users/vasugoel/ims_scraper_outputs/rooms_complete_data.json';

  if (!dataPath) {
    console.error('Data file not found in any of the expected locations.');
    process.exit(1);
  }

  console.log(`Starting Batch Seeding from: ${dataPath}`);
  
  try {
    await seedDepartments(client);
    client.release();

    const rawData = fs.readFileSync(dataPath, 'utf8');
    const universityData = JSON.parse(rawData);
    const rooms = universityData.rooms;

    console.log(`Total rooms to process: ${rooms.length}`);

    // Process in batches of 50 rooms
    const BATCH_SIZE = 50;
    for (let i = 0; i < rooms.length; i += BATCH_SIZE) {
      const batch = rooms.slice(i, i + BATCH_SIZE);
      await processBatch(batch);
      console.log(`Processed rooms ${i + 1} to ${Math.min(i + BATCH_SIZE, rooms.length)}`);
    }

    console.log('Seeding completed successfully!');
  } catch (err) {
    if (client) client.release();
    console.error('Seeding error:', err);
  } finally {
    await pool.end();
  }
}

async function processBatch(rooms) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const roomObj of rooms) {
      const roomName = roomObj.room;
      const { building, floor } = getBuildingAndFloor(roomName);
      
      const hasAc = roomObj.metadata?.has_ac ?? false;
      const hasProjector = roomObj.metadata?.has_projector ?? false;
      const capacity = [40, 60, 80, 100, 120][Math.floor(Math.random() * 5)];

      // 1. Insert/Update Room
      const roomRes = await client.query(
        `INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (name) DO UPDATE SET 
            building = EXCLUDED.building,
            floor = EXCLUDED.floor
         RETURNING id`,
        [roomName, building, floor, capacity, hasAc, hasProjector]
      );
      const roomId = roomRes.rows[0].id;

      // 2. Batch Availability for this room
      const availabilityValues = [];
      const availabilityParams = [];
      let paramIndex = 1;

      const seenSlots = new Set();
      const deduplicatedSlots = [];

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
          deduplicatedSlots.push({ dayStr, hour, isAvailable: !slot.is_occupied });
        }
      }

      for (const slot of deduplicatedSlots) {
        availabilityValues.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
        availabilityParams.push(roomId, slot.dayStr, slot.hour, slot.isAvailable);
        paramIndex += 4;
      }

      if (availabilityValues.length > 0) {
        const query = `
          INSERT INTO room_availability (room_id, day, hour, is_available)
          VALUES ${availabilityValues.join(', ')}
          ON CONFLICT (room_id, day, hour) DO UPDATE SET
            is_available = EXCLUDED.is_available
        `;
        await client.query(query, availabilityParams);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seed();

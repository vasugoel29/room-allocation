import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../src/config/env.js';

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
  let client = await pool.connect();
  // Try both possible data file locations
  const dataPaths = [
    path.join(__dirname, 'rooms_complete_data_updated.json'),
    path.join(__dirname, 'rooms_complete_data.json'),
    '/Users/vasugoel/ims_scraper_outputs/rooms_complete_data.json'
  ];

  let dataPath = null;
  for (const p of dataPaths) {
    if (fs.existsSync(p)) {
      dataPath = p;
      break;
    }
  }

  if (!dataPath) {
    console.error('Data file not found in any of the expected locations.');
    process.exit(1);
  }

  console.log(`Starting Batch Seeding from: ${dataPath}`);
  
  try {
    await seedDepartments(client);

    // Seed from exact database dump snapshot if it exists
    const dumpPath = path.join(__dirname, 'database_rooms_dump.json');
    if (fs.existsSync(dumpPath)) {
      console.log(`Found database rooms snapshot at: ${dumpPath}. Restoring configurations...`);
      const dumpRooms = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
      for (const r of dumpRooms) {
        await client.query(
          `INSERT INTO rooms (id, name, building, floor, capacity, has_ac, has_projector, type, description, student_access)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (name) DO UPDATE SET
             id = EXCLUDED.id,
             building = EXCLUDED.building,
             floor = EXCLUDED.floor,
             capacity = EXCLUDED.capacity,
             has_ac = EXCLUDED.has_ac,
             has_projector = EXCLUDED.has_projector,
             type = EXCLUDED.type,
             description = EXCLUDED.description,
             student_access = EXCLUDED.student_access`,
          [r.id, r.name, r.building, r.floor, r.capacity, r.has_ac, r.has_projector, r.type, r.description, r.student_access]
        );
      }
      console.log(`Successfully restored ${dumpRooms.length} rooms from snapshot.`);
    }

    client.release();
    client = null;

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
    if (client) {
      client.release();
    }
    console.error('Seeding error:', err);
  } finally {
    await pool.end();
  }
}

function getRoomType(roomName) {
  if (['5013', '5014', '5015'].includes(roomName)) return 'Committee Room';
  if (['5027', '5028', '5301'].includes(roomName)) return 'Auditorium';
  if (['5310', '5311', '5312', '5138'].includes(roomName)) return 'Lab';
  return 'Lecture Room';
}

async function processBatch(rooms) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const roomObj of rooms) {
      const roomName = roomObj.room;
      
      const building = roomObj.metadata?.building ?? getBuildingAndFloor(roomName).building;
      const floor = roomObj.metadata?.floor ?? getBuildingAndFloor(roomName).floor;
      const capacity = roomObj.metadata?.capacity ?? [40, 60, 80, 100, 120][Math.floor(Math.random() * 5)];
      const hasAc = roomObj.metadata?.has_ac ?? false;
      const hasProjector = roomObj.metadata?.has_projector ?? false;
      const type = roomObj.metadata?.type ?? getRoomType(roomName);
      const description = roomObj.metadata?.description ?? null;
      const studentAccess = roomObj.metadata?.student_access ?? true;

      // 1. Insert/Update Room
      const roomRes = await client.query(
        `INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector, type, description, student_access) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [roomName, building, floor, capacity, hasAc, hasProjector, type, description, studentAccess]
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

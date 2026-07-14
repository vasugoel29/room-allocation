import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

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
    'Department Of Computer Science (CSE)', 
    'Department Of Information Technology (IT)', 
    'Department Of Electronics & Communication (ECE)',
    'Department Of Electrical Engineering (EE)',
    'Department Of Mechanical Engineering (ME)',
    'Department Of Instrumentation & Control (ICE)',
    'Department Of Biotechnology',
    'Department Of Mathematics',
    'Department Of Physics',
    'Department Of Humanities & Management'
  ];

  console.log('Seeding departments...');
  for (const dept of departments) {
    const existing = await client.query('SELECT id FROM departments WHERE name = $1', [dept]);
    if (existing.rowCount === 0) {
      await client.query(
        'INSERT INTO departments (name) VALUES ($1)',
        [dept]
      );
    }
  }

  await client.query(
    `SELECT setval(
      pg_get_serial_sequence('departments', 'id'), 
      COALESCE((SELECT MAX(id) FROM departments), 1), 
      true
    )`
  );
}

function getRoomType(roomName) {
  if (['5013', '5014', '5015'].includes(roomName)) return 'Committee Room';
  if (['5027', '5028', '5301'].includes(roomName)) return 'Auditorium';
  if (['5310', '5311', '5312', '5138'].includes(roomName)) return 'Lab';
  return 'Lecture Room';
}

async function processRooms(rooms) {
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

      await client.query(
        `INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector, type, description, student_access) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (name) DO UPDATE SET 
           building = EXCLUDED.building,
           floor = EXCLUDED.floor,
           capacity = EXCLUDED.capacity,
           has_ac = EXCLUDED.has_ac,
           has_projector = EXCLUDED.has_projector,
           type = EXCLUDED.type,
           description = EXCLUDED.description,
           student_access = EXCLUDED.student_access
         RETURNING id`,
        [roomName, building, floor, capacity, hasAc, hasProjector, type, description, studentAccess]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await seedDepartments(client);

    // Scan for files
    const dataPaths = [
      path.resolve(__dirname, '../../../../backend/scripts/rooms_complete_data_updated.json'),
      path.resolve(__dirname, '../../../../backend/scripts/rooms_complete_data.json'),
      path.resolve(__dirname, '../../../scripts/rooms_complete_data_updated.json'),
      path.resolve(__dirname, '../../../scripts/rooms_complete_data.json'),
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
      console.warn('Rooms configuration json data file not found. Seeding base departments only.');
      return;
    }

    console.log(`Starting Batch Seeding of Rooms from: ${dataPath}`);
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const universityData = JSON.parse(rawData);
    const rooms = universityData.rooms;

    console.log(`Total rooms to process: ${rooms.length}`);
    const BATCH_SIZE = 50;
    for (let i = 0; i < rooms.length; i += BATCH_SIZE) {
      const batch = rooms.slice(i, i + BATCH_SIZE);
      await processRooms(batch);
      console.log(`Processed rooms ${i + 1} to ${Math.min(i + BATCH_SIZE, rooms.length)}`);
    }

    console.log('Rooms seeding completed successfully.');
  } catch (err) {
    console.error('Rooms seeder error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

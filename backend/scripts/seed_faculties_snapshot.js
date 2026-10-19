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

async function seed() {
  const filePath = path.resolve(__dirname, '../../faculties_data.json');
  if (!fs.existsSync(filePath)) {
    console.error(`Snapshot file not found at: ${filePath}`);
    process.exit(1);
  }

  console.log(`Loading faculties snapshot from: ${filePath}`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const faculties = data.faculties || [];
  console.log(`Loaded ${faculties.length} faculty schedules.`);

  const client = await pool.connect();
  try {
    console.log('Clearing old faculty timetable slots...');
    await client.query('TRUNCATE faculty_timetable_slots RESTART IDENTITY CASCADE');

    // Build room lookup cache to resolve room_id from room names
    const roomsRes = await client.query('SELECT id, name FROM rooms');
    const roomLookup = {};
    for (const r of roomsRes.rows) {
      roomLookup[r.name.toUpperCase()] = r.id;
    }

    const allSlots = [];
    for (const f of faculties) {
      const facultyName = f.faculty;
      const semester = f.semester;
      const schedule = f.schedule || {};

      for (const [day, slots] of Object.entries(schedule)) {
        for (const s of slots) {
          // Parse room name from content (e.g. "Room:5103" or "Room: 5103")
          let roomId = null;
          if (s.content) {
            const match = s.content.match(/Room:\s*([A-Za-z0-9-]+)/i);
            if (match) {
              const roomName = match[1].toUpperCase();
              roomId = roomLookup[roomName] || null;
            }
          }

          allSlots.push({
            facultyName,
            semester,
            dayOfWeek: day,
            slotTime: s.time_slot,
            content: s.content || '',
            isOccupied: s.is_occupied || false,
            roomId
          });
        }
      }
    }

    console.log(`Inserting ${allSlots.length} slots in batches...`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < allSlots.length; i += BATCH_SIZE) {
      const batch = allSlots.slice(i, i + BATCH_SIZE);
      const values = [];
      const params = [];
      let paramIndex = 1;

      for (const slot of batch) {
        values.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2}, $${paramIndex+3}, $${paramIndex+4}, $${paramIndex+5}, $${paramIndex+6})`);
        params.push(
          slot.facultyName,
          slot.semester,
          slot.dayOfWeek,
          slot.slotTime,
          slot.content,
          slot.isOccupied,
          slot.roomId
        );
        paramIndex += 7;
      }

      await client.query(
        `INSERT INTO faculty_timetable_slots (
          faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id
        ) VALUES ${values.join(', ')}`,
        params
      );
    }

    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

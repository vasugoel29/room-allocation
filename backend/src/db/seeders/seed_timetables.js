import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

function parseSlotTime(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split('-');
  if (parts.length < 2) return null;
  
  const parsePart = (p) => {
    const match = p.trim().match(/(\d{1,2}):(\d{2})/);
    if (!match) return '09:00:00';
    let hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    
    // Heuristic for 12h source format: 1-7 PM, 8-12 AM/Noon
    if (hours >= 1 && hours < 8) hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  };
  
  return {
    start: parsePart(parts[0]),
    end: parsePart(parts[1])
  };
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

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

async function seed() {
  const possiblePaths = [
    path.join(__dirname, '../../../../hajiri.timetables.json'),
    path.join(__dirname, '../../../hajiri.timetables.json'),
    path.join(__dirname, '../../hajiri.timetables.json'),
    path.join(__dirname, 'hajiri.timetables.json'),
    '/Users/vasugoel/Dev Projects/room-allocation/hajiri.timetables.json'
  ];

  let filePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    console.error('hajiri.timetables.json not found in any possible location.');
    process.exit(1);
  }

  console.log(`Loading timetables data from: ${filePath}`);
  const rawData = fs.readFileSync(filePath, 'utf8');
  const timetableData = JSON.parse(rawData);

  const client = await pool.connect();
  const dummyPasswordHash = await bcrypt.hash('facultypass123', 4);

  try {
    console.log('Seeding timetable slots...');
    let successCount = 0;
    let skipCount = 0;

    for (const obj of timetableData) {
      const { department, degree, specialization, section, year, semester, timetable } = obj;

      // 1. Resolve department
      const deptName = department ? department.trim() : 'General';
      let deptRes = await client.query('SELECT id FROM departments WHERE name = $1', [deptName]);
      let departmentId;
      if (deptRes.rowCount === 0) {
        deptRes = await client.query('INSERT INTO departments (name) VALUES ($1) RETURNING id', [deptName]);
      }
      departmentId = deptRes.rows[0].id;

      // 2. Resolve branch
      const branchName = specialization ? specialization.trim() : deptName;
      let shortCode = branchName.match(/\(([^)]+)\)/)?.[1] || branchName.substring(0, 3).toUpperCase();
      if (shortCode.length > 20) shortCode = shortCode.substring(0, 20);
      let branchRes = await client.query('SELECT id FROM branches WHERE name = $1 AND department_id = $2', [branchName, departmentId]);
      let branchId;
      if (branchRes.rowCount === 0) {
        branchRes = await client.query('INSERT INTO branches (name, short_code, department_id) VALUES ($1, $2, $3) RETURNING id', [branchName, shortCode, departmentId]);
      }
      branchId = branchRes.rows[0].id;

      for (const day in timetable) {
        const slots = timetable[day];
        const dayOfWeek = day.toUpperCase(); // MON, TUE, etc.

        for (const slot of slots) {
          const { time, subjectCode, subjectName, room, type, batch, faculty } = slot;

          const parsedTime = parseSlotTime(time);
          if (!parsedTime) continue;

          // 3. Resolve room
          let roomId = null;
          if (room) {
            const roomName = room.trim();
            let roomRes = await client.query('SELECT id FROM rooms WHERE UPPER(name) = UPPER($1)', [roomName]);
            if (roomRes.rowCount === 0) {
              const bf = getBuildingAndFloor(roomName);
              roomRes = await client.query(
                `INSERT INTO rooms (name, building, floor, capacity, type, has_ac, has_projector, student_access)
                 VALUES ($1, $2, $3, 60, 'Lecture Room', false, false, true) RETURNING id`,
                [roomName, bf.building, bf.floor]
              );
            }
            roomId = roomRes.rows[0].id;
          }

          // 4. Resolve subject
          let subjectId = null;
          if (subjectCode && subjectName) {
            const sCode = subjectCode.trim();
            const sName = subjectName.trim();
            let subRes = await client.query('SELECT id FROM subjects WHERE code = $1', [sCode]);
            if (subRes.rowCount === 0) {
              subRes = await client.query('INSERT INTO subjects (code, name, department_id) VALUES ($1, $2, $3) RETURNING id', [sCode, sName, departmentId]);
            }
            subjectId = subRes.rows[0].id;
          }

          // 5. Resolve faculty user
          let facultyId = null;
          if (faculty) {
            const fName = toTitleCase(faculty.trim());
            let facRes = await client.query("SELECT id FROM users WHERE role = 'FACULTY' AND UPPER(name) = UPPER($1)", [fName]);
            if (facRes.rowCount === 0) {
              const fEmail = `${fName.toLowerCase().replace(/[^a-z]/g, '')}@nsut.ac.in`;
              // Prevent email conflicts
              let emailCheck = await client.query('SELECT id FROM users WHERE email = $1', [fEmail]);
              let finalEmail = fEmail;
              if (emailCheck.rowCount > 0) {
                finalEmail = `${fName.toLowerCase().replace(/[^a-z]/g, '')}${Math.floor(100 + Math.random() * 900)}@nsut.ac.in`;
              }
              facRes = await client.query(
                `INSERT INTO users (name, email, password_hash, role, department_id, is_approved)
                 VALUES ($1, $2, $3, 'FACULTY', $4, true) RETURNING id`,
                [fName, finalEmail, dummyPasswordHash, departmentId]
              );
            }
            facultyId = facRes.rows[0].id;
          }

          // 6. CHECK FOR GIST OVERLAP CONFLICTS
          // A: Room overlap
          if (roomId) {
            const roomOverlap = await client.query(`
              SELECT id FROM timetable_slots
              WHERE room_id = $1 AND day_of_week = $2
                AND timerange(start_time, end_time) && timerange($3::time, $4::time)
            `, [roomId, dayOfWeek, parsedTime.start, parsedTime.end]);
            if (roomOverlap.rowCount > 0) {
              skipCount++;
              continue; // Skip slot
            }
          }

          // B: Faculty overlap
          if (facultyId) {
            const facOverlap = await client.query(`
              SELECT id FROM timetable_slots
              WHERE faculty_id = $1 AND day_of_week = $2
                AND timerange(start_time, end_time) && timerange($3::time, $4::time)
            `, [facultyId, dayOfWeek, parsedTime.start, parsedTime.end]);
            if (facOverlap.rowCount > 0) {
              skipCount++;
              continue; // Skip slot
            }
          }

          // 7. Insert slot
          await client.query(
            `INSERT INTO timetable_slots (
              branch_id, semester, section, batch, day_of_week, start_time, end_time, subject_id, room_id, faculty_id, type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              branchId,
              parseInt(semester) || 1,
              section || null,
              batch || null,
              dayOfWeek,
              parsedTime.start,
              parsedTime.end,
              subjectId,
              roomId,
              facultyId,
              type || 'Lecture'
            ]
          );
          successCount++;
        }
      }
    }

    console.log(`Timetable slots seeding finished: ${successCount} slots seeded, ${skipCount} slots skipped due to overlap conflicts.`);
  } catch (err) {
    console.error('Timetable seeder error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

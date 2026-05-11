import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env.development' });

const dbUrl = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('neon') ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const filePath = '../hajiri.timetables.json';
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE timetable_slots');
    
    console.log(`Starting migration of ${data.length} main objects...`);
    
    for (const obj of data) {
      const { department, degree, specialization, section, year, semester, timetable } = obj;
      
      for (const day in timetable) {
        const slots = timetable[day];
        for (const slot of slots) {
          const { time, subjectCode, subjectName, room, type, batch, faculty } = slot;
          
          await client.query(
            `INSERT INTO timetable_slots (
              department, degree, specialization, section, year, semester, 
              day_of_week, slot_time, subject_code, subject_name, room_name, type, batch, faculty_name
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              department, degree, specialization, section, year, semester,
              day, time, subjectCode, subjectName, room, type, batch, faculty
            ]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    console.log('Migration completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.log('Migration failed, rolled back.', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();

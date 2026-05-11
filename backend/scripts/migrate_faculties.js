import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env.development') });

const dbUrl = process.env.DATABASE_URL || '';
const pool = new Pool({
  connectionString: dbUrl,
  ssl: dbUrl.includes('neon') ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const filePath = path.resolve(process.cwd(), './faculties_data.json');
  console.log(`Reading file from: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(fileContent);
  const faculties = data.faculties || [];
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE faculty_timetable_slots');
    
    console.log(`Starting migration of ${faculties.length} faculties...`);
    
    let totalSlots = 0;
    for (const f of faculties) {
      const { faculty, semester, schedule } = f;
      
      for (const day in schedule) {
        const slots = schedule[day];
        for (const slot of slots) {
          // Only migrate occupied slots to follow the hajiri pattern (only storing classes)
          if (slot.is_occupied) {
            await client.query(
              `INSERT INTO faculty_timetable_slots (
                faculty_name, semester, day_of_week, slot_time, content, is_occupied
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                faculty, semester, day, slot.time_slot, slot.content, true
              ]
            );
            totalSlots++;
          }
        }
      }
    }
    
    await client.query('COMMIT');
    console.log(`Migration completed successfully! Inserted ${totalSlots} slots.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.log('Migration failed, rolled back.', err);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();

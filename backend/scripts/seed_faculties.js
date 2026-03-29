import xlsx from 'xlsx';
import bcrypt from 'bcrypt';
import { pool } from '../src/db.js';

async function seed() {
  const filePath = '/Users/vasugoel/Downloads/Faculty Details.xlsx';
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  const hash = await bcrypt.hash('password123', 10);
  const defaultRole = 'FACULTY';
  
  let count = 0;
  
  console.log('Connecting to local DB...');
  try {
    const client = await pool.connect();
    const dbInfo = await client.query("SELECT current_database(), current_schema()");
    console.log('Seed Script DB Info:', dbInfo.rows[0]);
    console.log('Connected! Starting transaction...');
    await client.query('BEGIN');
    for (const row of data) {
      if (!row['Email Id'] || !row['Name of Employee']) continue;
      const email = String(row['Email Id']).toLowerCase().trim();
      const name = String(row['Name of Employee']).trim();
      const department = row['Department'] ? String(row['Department']).trim() : null;
      
      await client.query(
        `INSERT INTO users (name, email, password, role, department) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (email) 
         DO UPDATE SET role = EXCLUDED.role, department = EXCLUDED.department`,
        [name, email, hash, defaultRole, department]
      );
      count++;
      if (count % 50 === 0) console.log(`Processed ${count} rows`);
    }
    await client.query('COMMIT');
    console.log(`Successfully seeded ${count} faculties to local docker DB`);
    client.release();
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    pool.end();
  }
}

seed();

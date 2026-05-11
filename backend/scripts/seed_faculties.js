import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import xlsx from 'xlsx';
import bcrypt from 'bcrypt';
import pkg from 'pg';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

async function seed() {
  const filePath = path.join(__dirname, '../../Faculty Details.xlsx');
  console.log(`Searching for Faculty file at: ${filePath}`);
  
  if (!xlsx.readFile) { // Basic check for xlsx loading
    console.error('XLSX library not properly loaded.');
    process.exit(1);
  }

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  const hash = await bcrypt.hash('password123', 10);
  const defaultRole = 'FACULTY';
  
  let count = 0;
  
  console.log('Connecting to database...');
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
    console.log(`Successfully seeded ${count} faculties to database`);
    client.release();
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    pool.end();
  }
}

seed();

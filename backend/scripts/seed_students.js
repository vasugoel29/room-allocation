import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import bcrypt from 'bcrypt';
import '../src/config/env.js';
import { pool } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  const possiblePaths = [
    '/Users/vasugoel/Downloads/Report.xlsx',
    path.join(__dirname, '../../Report.xlsx'),
    path.join(__dirname, '../Report.xlsx'),
  ];

  let filePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    console.error('Report.xlsx file not found in any possible location.');
    process.exit(1);
  }

  console.log(`Loading students data from: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  console.log(`Loaded ${data.length} student records from sheet.`);

  let count = 0;
  console.log('Connecting to database...');

  try {
    const client = await pool.connect();
    console.log('Connected! Starting transaction...');
    await client.query('BEGIN');

    // Make sure our v9 migrations columns exist if migrations are somehow out of sync
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS degree VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_no VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS department_name VARCHAR(255);
    `);

    for (const row of data) {
      // Look up keys dynamically with string matching for high robustness
      const nameKey = Object.keys(row).find(k => k.toLowerCase().includes('name'));
      const emailKey = Object.keys(row).find(k => k.toLowerCase().includes('email'));
      const rollKey = Object.keys(row).find(k => k.toLowerCase().includes('roll') || k.toLowerCase().includes('reg'));
      const branchKey = Object.keys(row).find(k => k.toLowerCase().includes('branch') || k.toLowerCase().includes('stream'));
      const yearKey = Object.keys(row).find(k => k.toLowerCase().includes('year') || k.toLowerCase().includes('sem'));
      const sectionKey = Object.keys(row).find(k => k.toLowerCase().includes('section') || k.toLowerCase().includes('sec'));
      const degreeKey = Object.keys(row).find(k => k.toLowerCase().includes('degree') || k.toLowerCase().includes('course'));
      const deptKey = Object.keys(row).find(k => k.toLowerCase().includes('dept') || k.toLowerCase().includes('department'));

      const name = nameKey ? String(row[nameKey]).trim() : 'Unnamed Student';
      const roll_no = rollKey ? String(row[rollKey]).trim() : null;
      let email = emailKey ? String(row[emailKey]).toLowerCase().trim() : null;

      if (!email && roll_no) {
        email = `${roll_no.toLowerCase()}@nsut.ac.in`;
      }

      if (!email) {
        console.warn(`Skipping record without email or roll number: ${JSON.stringify(row)}`);
        continue;
      }

      const branch = branchKey ? String(row[branchKey]).trim() : null;
      let year = yearKey ? parseInt(row[yearKey]) || 1 : 1;
      let section = sectionKey ? parseInt(row[sectionKey]) || 1 : 1;

      // Keep within bounds of migrations 3 constraint
      year = Math.min(5, Math.max(1, year));
      section = Math.min(15, Math.max(1, section));

      const degree = degreeKey ? String(row[degreeKey]).trim() : null;
      const department_name = deptKey ? String(row[deptKey]).trim() : null;

      // "password as name and random 4 digits"
      const nameWithoutSpaces = name.toLowerCase().replace(/[^a-z]/g, '') || 'student';
      const plainPassword = nameWithoutSpaces + Math.floor(1000 + Math.random() * 9000);
      const passwordHash = await bcrypt.hash(plainPassword, 10);

      // We'll upsert by email
      await client.query(
        `INSERT INTO users (
          name, email, password, role, branch, year, section, is_approved, degree, roll_no, department_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (email)
        DO UPDATE SET 
          name = EXCLUDED.name,
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          branch = EXCLUDED.branch,
          year = EXCLUDED.year,
          section = EXCLUDED.section,
          is_approved = EXCLUDED.is_approved,
          degree = EXCLUDED.degree,
          roll_no = EXCLUDED.roll_no,
          department_name = EXCLUDED.department_name`,
        [name, email, passwordHash, 'VIEWER', branch, year, section, true, degree, roll_no, department_name]
      );

      console.log(`Seeded student: ${name} (${email}) with password: ${plainPassword}`);
      count++;
    }

    await client.query('COMMIT');
    console.log(`\nSuccessfully seeded ${count} students data with viewer role.`);
    client.release();
  } catch (err) {
    console.error('Seeding failed, rolling back.', err);
  } finally {
    await pool.end();
  }
}

seed();

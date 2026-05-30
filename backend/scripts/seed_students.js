import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import bcrypt from 'bcrypt';
import '../src/config/env.js';
import { pool } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getSection(branchCode, rollSuffix) {
  if (!rollSuffix || rollSuffix.length < 2) return 1;
  const firstTwo = rollSuffix.substring(0, 2);
  const n = parseInt(firstTwo);
  if (isNaN(n)) return 1;

  const branch = branchCode.toUpperCase();

  // 1. CSE Branch mappings
  if (branch === 'UCS') {
    if (n === 15) return 1;
    if (n === 16) return 2;
    if (n === 17) return 3;
  }
  if (branch === 'UCA') {
    if (n === 18) return 1;
    if (n === 19) return 2;
  }
  if (branch === 'UCD') return 1;
  if (branch === 'UCM') return 1;

  // 2. IT Branch mappings
  if (branch === 'UIT') {
    if (n === 30) return 1;
    if (n === 31) return 2;
  }
  if (branch === 'UIN') return 1;

  // 3. ECE mappings
  if (branch === 'UEC') {
    if (n === 25) return 1;
    if (n === 26) return 2;
    if (n === 27) return 3;
  }
  if (branch === 'UEI' || branch === 'UEV') return 1;

  // 4. EE mappings
  if (branch === 'UEE') {
    if (n === 35 || n === 40 || n === 45) return 1;
    if (n === 36 || n === 41 || n === 46) return 2;
  }

  // 5. ICE mappings
  if (branch === 'UIC') {
    if (n === 35 || n === 40) return 1;
    if (n === 36 || n === 41) return 2;
  }

  // 6. ME mappings
  if (branch === 'UME') {
    if (n === 40) return 1;
    if (n === 41 || n === 42) return 2;
  }

  // 7. Management mappings (BBA)
  if (branch === 'UBA') {
    if (n === 90) return 1;
    if (n === 91) return 2;
  }
  
  return 1;
}

async function seed() {
  const possiblePaths = [
    path.join(__dirname, '../../Report (1).xlsx'),
    path.join(__dirname, '../Report (1).xlsx'),
    path.join(__dirname, 'Report (1).xlsx'),
    '/Users/vasugoel/Dev Projects/room-allocation/Report (1).xlsx',
    '/Users/vasugoel/Downloads/Report (1).xlsx',
    path.join(__dirname, '../../Report.xlsx'),
    path.join(__dirname, '../Report.xlsx'),
    path.join(__dirname, 'Report.xlsx'),
    '/Users/vasugoel/Downloads/Report.xlsx',
  ];

  let filePath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    console.error('Student Excel report file not found in any possible location.');
    process.exit(1);
  }

  console.log(`Loading students data from: ${filePath}`);

  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  console.log(`Loaded ${data.length} student records from sheet.`);

  // Scan and insert unique departments from the spreadsheet to ensure mapping works
  const uniqueDeptsInSheet = Array.from(
    new Set(
      data
        .map((row) => {
          const deptKey = Object.keys(row).find(
            (k) => k.toLowerCase().includes('dept') || k.toLowerCase().includes('department')
          );
          return deptKey ? String(row[deptKey]).trim() : null;
        })
        .filter(Boolean)
    )
  );

  console.log(`Found ${uniqueDeptsInSheet.length} unique departments in the sheet.`);

  const deptMapping = {};
  const initClient = await pool.connect();
  try {
    // Make sure our v9 migrations columns exist if migrations are somehow out of sync
    await initClient.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS degree VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS roll_no VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS department_name VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);
    `);

    // Ensure all departments are in the database and map them to their database IDs
    for (const deptName of uniqueDeptsInSheet) {
      const res = await initClient.query(
        'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [deptName]
      );
      deptMapping[deptName] = res.rows[0].id;
    }
    console.log('Upserted and mapped all departments in database successfully.');
  } catch (err) {
    console.error('Column initialization or department seeding failed:', err);
  } finally {
    initClient.release();
  }

  const BATCH_SIZE = 100;
  const total = data.length;
  let count = 0;
  const credentials = [];
  const seenEmailsGlobal = new Set();

  console.log(`Starting batch seeding of ${total} students in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);

    // 1. Process rows and hash passwords in parallel for the current batch
    const processedBatch = await Promise.all(
      batch.map(async (row) => {
        // Find keys dynamically, prioritizing NSUT EMAIL ID
        const nameKey = Object.keys(row).find((k) => k.toLowerCase().includes('name'));
        
        let emailKey = Object.keys(row).find((k) => k === 'NSUT EMAIL ID');
        if (!emailKey) {
          emailKey = Object.keys(row).find((k) => k.toLowerCase().includes('email'));
        }

        const rollKey = Object.keys(row).find(
          (k) => k.toLowerCase().includes('roll') || k.toLowerCase().includes('reg')
        );
        const sectionKey = Object.keys(row).find(
          (k) => k.toLowerCase().includes('section') || k.toLowerCase().includes('sec')
        );
        const degreeKey = Object.keys(row).find(
          (k) => k.toLowerCase().includes('degree') || k.toLowerCase().includes('course')
        );
        const deptKey = Object.keys(row).find(
          (k) => k.toLowerCase().includes('dept') || k.toLowerCase().includes('department')
        );

        const name = nameKey ? String(row[nameKey]).trim() : 'Unnamed Student';
        const roll_no = rollKey ? String(row[rollKey]).trim() : null;
        let email = emailKey ? String(row[emailKey]).toLowerCase().trim() : null;

        if (!email && roll_no) {
          email = `${roll_no.toLowerCase()}@nsut.ac.in`;
        }

        if (!email) {
          return null;
        }

        // Prevent duplicate emails globally
        if (seenEmailsGlobal.has(email)) {
          return null;
        }
        seenEmailsGlobal.add(email);

        const department_name = deptKey ? String(row[deptKey]).trim() : null;
        const branch = department_name; // Treat department and branch as the same thing
        const department_id = department_name ? (deptMapping[department_name] || null) : null;
        
        let yearKey = Object.keys(row).find(
          (k) => k.toLowerCase().includes('sem') || k.toLowerCase().includes('semester')
        );
        if (!yearKey) {
          yearKey = Object.keys(row).find(
            (k) => k.toLowerCase().includes('year') && !k.toLowerCase().includes('exam')
          );
        }

        let year = 1;
        if (yearKey) {
          const val = parseInt(row[yearKey]) || 1;
          // If header name contains "sem", compute year = Math.ceil(semester / 2)
          if (yearKey.toLowerCase().includes('sem')) {
            year = Math.ceil(val / 2);
          } else {
            year = val;
          }
        }
        
        let section = 1;
        if (sectionKey) {
          section = parseInt(row[sectionKey]) || 1;
        } else if (roll_no) {
          // Parse section from the roll number, e.g. 2021UCA1808 -> CSAI, suffix 1808 -> section 1
          const match = roll_no.match(/^(\d{4})([A-Z]+)(\d{4})$/);
          if (match) {
            const branchCode = match[2];
            const rollSuffix = match[3];
            section = getSection(branchCode, rollSuffix);
          }
        }

        // Keep within bounds of constraints
        year = Math.min(5, Math.max(1, year));
        section = Math.min(15, Math.max(1, section));

        const degree = degreeKey ? String(row[degreeKey]).trim() : null;

        // "password as name and random 4 digits"
        const nameWithoutSpaces = name.toLowerCase().replace(/[^a-z]/g, '') || 'student';
        const plainPassword = nameWithoutSpaces + Math.floor(1000 + Math.random() * 9000);
        
        // Fast hashing rounds = 4 for ultra-fast seeding
        const passwordHash = await bcrypt.hash(plainPassword, 4);

        // Save credential details
        credentials.push({ email, password: plainPassword });

        return {
          name,
          email,
          passwordHash,
          branch,
          year,
          section,
          degree,
          roll_no,
          department_name,
          department_id,
        };
      })
    );

    const validStudents = processedBatch.filter((s) => s !== null);
    if (validStudents.length === 0) continue;

    // 2. Build multi-row INSERT query
    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const student of validStudents) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, $${paramIndex + 10}, $${paramIndex + 11})`
      );
      params.push(
        student.name,
        student.email,
        student.passwordHash,
        'VIEWER',
        student.branch,
        student.year,
        student.section,
        true,
        student.degree,
        student.roll_no,
        student.department_name,
        student.department_id
      );
      paramIndex += 12;
    }

    const query = `
      INSERT INTO users (
        name, email, password, role, branch, year, section, is_approved, degree, roll_no, department_name, department_id
      ) VALUES ${values.join(', ')}
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
        department_name = EXCLUDED.department_name,
        department_id = EXCLUDED.department_id
    `;

    const client = await pool.connect();
    try {
      await client.query(query, params);
      count += validStudents.length;
      if (count % 500 === 0 || count === total || i + BATCH_SIZE >= total) {
        console.log(`Seeded ${count} / ${total} students...`);
      }
    } catch (err) {
      console.error(`Batch insertion failed for range ${i} to ${i + BATCH_SIZE}:`, err);
    } finally {
      client.release();
    }
  }

  console.log(`\nSuccessfully seeded ${count} students data with viewer role.`);

  // Write credentials dump file
  const credPath = path.join(__dirname, 'seeded_students_credentials.json');
  fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf8');
  console.log(`Saved credentials dump for ${credentials.length} students to: ${credPath}`);

  await pool.end();
}

seed();

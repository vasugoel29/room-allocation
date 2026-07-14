import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import bcrypt from 'bcrypt';
import '../../config/env.js';
import { pool } from '../../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getSection(branchCode, rollSuffix) {
  if (!rollSuffix || rollSuffix.length < 2) return 1;
  const firstTwo = rollSuffix.substring(0, 2);
  const n = parseInt(firstTwo);
  if (isNaN(n)) return 1;

  const branch = branchCode.toUpperCase();

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

  if (branch === 'UIT') {
    if (n === 30) return 1;
    if (n === 31) return 2;
  }
  if (branch === 'UIN') return 1;

  if (branch === 'UEC') {
    if (n === 25) return 1;
    if (n === 26) return 2;
    if (n === 27) return 3;
  }
  if (branch === 'UEI' || branch === 'UEV') return 1;

  if (branch === 'UEE') {
    if (n === 35 || n === 40 || n === 45) return 1;
    if (n === 36 || n === 41 || n === 46) return 2;
  }

  if (branch === 'UIC') {
    if (n === 35 || n === 40) return 1;
    if (n === 36 || n === 41) return 2;
  }

  if (branch === 'UME') {
    if (n === 40) return 1;
    if (n === 41 || n === 42) return 2;
  }

  if (branch === 'UBA') {
    if (n === 90) return 1;
    if (n === 91) return 2;
  }
  
  return 1;
}

function extractShortCode(deptName) {
  const match = deptName.match(/\(([^)]+)\)/);
  let code = match ? match[1].toUpperCase() : deptName.split(' ').map(w => w[0]).join('').toUpperCase();
  return code.substring(0, 20);
}

async function seed() {
  const possiblePaths = [
    path.join(__dirname, '../../../../Report (1).xlsx'),
    path.join(__dirname, '../../../Report (1).xlsx'),
    path.join(__dirname, '../../Report (1).xlsx'),
    path.join(__dirname, 'Report (1).xlsx'),
    '/Users/vasugoel/Dev Projects/room-allocation/Report (1).xlsx',
    '/Users/vasugoel/Downloads/Report (1).xlsx',
    path.join(__dirname, '../../../../Report.xlsx'),
    path.join(__dirname, '../../../Report.xlsx'),
    path.join(__dirname, '../../Report.xlsx'),
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

  // Scan and insert unique departments & branches
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
  const branchMapping = {};
  const initClient = await pool.connect();
  try {
    // 1. Ensure departments and get mappings
    for (const deptName of uniqueDeptsInSheet) {
      const res = await initClient.query(
        'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [deptName]
      );
      const deptId = res.rows[0].id;
      deptMapping[deptName] = deptId;

      // 2. Ensure branches for each department
      const shortCode = extractShortCode(deptName);
      const branchRes = await initClient.query(
        `INSERT INTO branches (name, short_code, department_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (name, department_id) DO UPDATE SET short_code = EXCLUDED.short_code
         RETURNING id`,
        [deptName, shortCode, deptId]
      );
      branchMapping[deptName] = branchRes.rows[0].id;
    }
    console.log('Upserted and mapped all departments/branches successfully.');
  } catch (err) {
    console.error('Department or branch seeding failed:', err);
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

    const processedBatch = await Promise.all(
      batch.map(async (row) => {
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

        if (!email) return null;

        if (seenEmailsGlobal.has(email)) return null;
        seenEmailsGlobal.add(email);

        const department_name = deptKey ? String(row[deptKey]).trim() : null;
        const department_id = department_name ? (deptMapping[department_name] || null) : null;
        const branch_id = department_name ? (branchMapping[department_name] || null) : null;
        
        let yearKey = Object.keys(row).find(
          (k) => k.toLowerCase().includes('sem') || k.toLowerCase().includes('semester')
        );
        if (!yearKey) {
          yearKey = Object.keys(row).find(
            (k) => k.toLowerCase().includes('year') && !k.toLowerCase().includes('exam')
          );
        }

        let year = 1;
        let semester = 2;
        if (yearKey) {
          const val = parseInt(row[yearKey]) || 1;
          if (yearKey.toLowerCase().includes('sem')) {
            semester = val;
            year = Math.ceil(val / 2);
          } else {
            year = val;
            semester = val * 2;
          }
        }
        
        let section = 1;
        if (sectionKey) {
          section = parseInt(row[sectionKey]) || 1;
        } else if (roll_no) {
          const match = roll_no.match(/^(\d{4})([A-Z]+)(\d{4})$/);
          if (match) {
            const branchCode = match[2];
            const rollSuffix = match[3];
            section = getSection(branchCode, rollSuffix);
          }
        }

        year = Math.min(5, Math.max(1, year));
        semester = Math.min(10, Math.max(1, semester));
        section = Math.min(20, Math.max(1, section));

        const degree = degreeKey ? String(row[degreeKey]).trim() : null;

        const nameWithoutSpaces = name.toLowerCase().replace(/[^a-z]/g, '') || 'student';
        const plainPassword = nameWithoutSpaces + Math.floor(1000 + Math.random() * 9000);
        
        const passwordHash = await bcrypt.hash(plainPassword, 4);
        credentials.push({ email, password: plainPassword });

        return {
          name,
          email,
          passwordHash,
          year,
          semester,
          section,
          degree,
          roll_no,
          department_id,
          branch_id
        };
      })
    );

    const validStudents = processedBatch.filter((s) => s !== null);
    if (validStudents.length === 0) continue;

    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const student of validStudents) {
      values.push(
        `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, 'VIEWER', $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7}, $${paramIndex + 8}, $${paramIndex + 9}, true)`
      );
      params.push(
        student.name,
        student.email,
        student.passwordHash,
        student.department_id,
        student.branch_id,
        student.degree,
        student.roll_no,
        student.year,
        student.semester,
        student.section
      );
      paramIndex += 10;
    }

    const query = `
      INSERT INTO users (
        name, email, password_hash, role, department_id, branch_id, degree, roll_no, year, semester, section, is_approved
      ) VALUES ${values.join(', ')}
      ON CONFLICT (email)
      DO UPDATE SET 
        name = EXCLUDED.name,
        password_hash = EXCLUDED.password_hash,
        department_id = EXCLUDED.department_id,
        branch_id = EXCLUDED.branch_id,
        degree = EXCLUDED.degree,
        roll_no = EXCLUDED.roll_no,
        year = EXCLUDED.year,
        semester = EXCLUDED.semester,
        section = EXCLUDED.section,
        is_approved = EXCLUDED.is_approved
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

  console.log(`\nSuccessfully seeded ${count} students data.`);

  const credPath = path.join(__dirname, 'seeded_students_credentials.json');
  fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf8');
  console.log(`Saved credentials dump for ${credentials.length} students to: ${credPath}`);

  await pool.end();
}

seed();

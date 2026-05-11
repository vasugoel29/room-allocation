import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import pkg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : {
    rejectUnauthorized: false
  }
});

const SEED_USERS = [
  // ADMIN
  {
    name: 'Vasu Goel',
    email: 'vasu.goel.ug22@nsut.ac.in',
    password: 'Password@123',
    role: 'ADMIN',
    branch: 'CSE',
    year: 3,
    section: 2,
    department_name: 'Computer Science (CSE)',
  },

  // STUDENT REPRESENTATIVES
  {
    name: 'Arjun Sharma',
    email: 'arjun.sharma.ug22@nsut.ac.in',
    password: 'Password@123',
    role: 'STUDENT_REP',
    branch: 'CSE',
    year: 3,
    section: 1,
    department_name: 'Computer Science (CSE)',
  },
  {
    name: 'Priya Verma',
    email: 'priya.verma.ug23@nsut.ac.in',
    password: 'Password@123',
    role: 'STUDENT_REP',
    branch: 'IT',
    year: 2,
    section: 3,
    department_name: 'Information Technology (IT)',
  },

  // FACULTY
  {
    name: 'Dr. Rajesh Kumar',
    email: 'rajesh.kumar@nsut.ac.in',
    password: 'Password@123',
    role: 'FACULTY',
    department_name: 'Computer Science (CSE)',
    is_approved: true,
  },
  {
    name: 'Dr. Meena Agarwal',
    email: 'meena.agarwal@nsut.ac.in',
    password: 'Password@123',
    role: 'FACULTY',
    department_name: 'Electronics & Communication (ECE)',
    is_approved: true,
  },
  {
    name: 'Dr. Sunil Pandey',
    email: 'sunil.pandey@nsut.ac.in',
    password: 'Password@123',
    role: 'FACULTY',
    department_name: 'Information Technology (IT)',
    is_approved: false, // Pending approval
  },

  // VIEWERS (regular students)
  {
    name: 'Neha Singh',
    email: 'neha.singh.ug23@nsut.ac.in',
    password: 'Password@123',
    role: 'VIEWER',
    branch: 'ECE',
    year: 2,
    section: 4,
    department_name: 'Electronics & Communication (ECE)',
    roll_no: '2023ECE0145',
    degree: 'B.Tech',
  },
  {
    name: 'Rahul Jain',
    email: 'rahul.jain.ug24@nsut.ac.in',
    password: 'Password@123',
    role: 'VIEWER',
    branch: 'ME',
    year: 1,
    section: 2,
    department_name: 'Mechanical Engineering (ME)',
    roll_no: '2024ME0089',
    degree: 'B.Tech',
  },
  {
    name: 'Anjali Gupta',
    email: 'anjali.gupta.ug22@nsut.ac.in',
    password: 'Password@123',
    role: 'VIEWER',
    branch: 'IT',
    year: 3,
    section: 1,
    department_name: 'Information Technology (IT)',
    roll_no: '2022IT0201',
    degree: 'B.Tech',
  },
  {
    name: 'Karan Mehta',
    email: 'karan.mehta.ug23@nsut.ac.in',
    password: 'Password@123',
    role: 'VIEWER',
    branch: 'CSE',
    year: 2,
    section: 5,
    department_name: 'Computer Science (CSE)',
    roll_no: '2023CSE0312',
    degree: 'B.Tech',
  },
];

async function seedUsers() {
  const client = await pool.connect();

  try {
    console.log('🌱 Seeding users...\n');

    for (const user of SEED_USERS) {
      const hash = await bcrypt.hash(user.password, 10);

      // Resolve department_id
      let departmentId = null;
      if (user.department_name) {
        const deptRes = await client.query(
          'SELECT id FROM departments WHERE name = $1',
          [user.department_name]
        );
        departmentId = deptRes.rows[0]?.id || null;
      }

      await client.query(
        `INSERT INTO users (name, email, password, role, branch, year, section, department_id, department_name, is_approved, roll_no, degree)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password = EXCLUDED.password,
           role = EXCLUDED.role,
           branch = EXCLUDED.branch,
           year = EXCLUDED.year,
           section = EXCLUDED.section,
           department_id = EXCLUDED.department_id,
           department_name = EXCLUDED.department_name,
           is_approved = EXCLUDED.is_approved,
           roll_no = EXCLUDED.roll_no,
           degree = EXCLUDED.degree`,
        [
          user.name,
          user.email,
          hash,
          user.role,
          user.branch || null,
          user.year || null,
          user.section || null,
          departmentId,
          user.department_name || null,
          user.is_approved !== false, // default true
          user.roll_no || null,
          user.degree || null,
        ]
      );

      const approvalTag = user.is_approved === false ? ' (pending approval)' : '';
      console.log(`  ✅ ${user.role.padEnd(12)} ${user.name} — ${user.email}${approvalTag}`);
    }

    console.log(`\n🎉 Seeded ${SEED_USERS.length} users successfully!`);
    console.log(`\n📋 All passwords: Password@123`);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seedUsers();

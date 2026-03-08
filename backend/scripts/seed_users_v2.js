import bcrypt from 'bcrypt';
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')) 
    ? false 
    : { rejectUnauthorized: false }
});

const DATA_YEAR_3 = `
CSE1
CSE2
CSAI1
CSAI2
CSDS
CSDA
CIVIL
GEO
Arch
MEEV
ECAM1
ECAM2
EE1
EE2
ECE1
ECE2
ICE1
ICE2
ME1
ME2
IT1
IT2
ITNS
EIOT
MBA-IEV
BBA-IEV
BBA 1
BBA 2
BT
MAC
CIOT
EIOT
MA-Psych
M-Sc 
BDES-PD
BDES-FT
MA-English
`;

const DATA_YEAR_4 = `
CSE1
CSE2
CSE3
CSAI1
CSAI2
CSDS
CSDA
CIVIL
GEO
ARCH
MEEV
ECAM1
EE1
EE2
ECE1
ECE2
ICE1
ICE2
ME1
ME2
ME3
IT1
IT2
ITNS
EIOT
BBA IEV
PRODUCT DESIGN
BFTECH
BT
MAC
CIOT
BBA 1
BBA 2
MBA-IEV
`;

const random4Digits = () => Math.floor(1000 + Math.random() * 9000).toString();

const parseData = (raw, year) => {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    line = line.trim();
    // Match "BranchSection" or "Branch Section" (e.g., CSE1, BBA 1)
    const match = line.match(/^(.+?)(\d+)$/);
    let branch, section;
    if (match) {
      branch = match[1].trim();
      section = match[2].trim();
    } else {
      branch = line;
      section = '1'; // Default
    }

    const branchSlug = branch.toLowerCase()
      .replace(/[^\w\s]/g, '') // remove symbols for email
      .replace(/\s+/g, '_');
    
    const branchPassword = branch.toLowerCase()
      .replace(/[^\w]/g, ''); // alphanumeric only for pw

    const email = `${branchSlug}_${year}_${section}@nsut.ac.in`;
    const name = `${branch}-${section} ${year} Year`;
    const password = `${branchPassword}${year}${section}-${random4Digits()}`;
    
    return { name, email, password, year, section: parseInt(section) };
  });
};

async function seedUsers() {
  const usersYear3 = parseData(DATA_YEAR_3, 3);
  const usersYear4 = parseData(DATA_YEAR_4, 4);
  const allUsers = [...usersYear3, ...usersYear4];

  console.log(`Parsed ${allUsers.length} users. Hashing passwords and seeding...`);

  const csvRows = ['Name,Email,Password,Year,Section'];

  try {
    for (const u of allUsers) {
      const hash = await bcrypt.hash(u.password, 10);
      try {
        await pool.query(
          `INSERT INTO users (name, email, password, role, year, section) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           ON CONFLICT (email) 
           DO UPDATE SET password = EXCLUDED.password, name = EXCLUDED.name`,
          [u.name, u.email, hash, 'STUDENT_REP', u.year, u.section]
        );
        csvRows.push(`${u.name},${u.email},${u.password},${u.year},${u.section}`);
        console.log(`Updated: ${u.email} | PW: ${u.password}`);
      } catch (e) {
        console.error(`Failed to seed ${u.email}:`, e.message);
      }
    }

    const csvContent = csvRows.join('\n');
    const csvPath = path.join(__dirname, 'seeded_credentials.csv');
    fs.writeFileSync(csvPath, csvContent);
    
    console.log(`Seeding completed! Credentials log saved to: ${csvPath}`);
  } catch (err) {
    console.error('Database error:', err);
  } finally {
    await pool.end();
  }
}

seedUsers();

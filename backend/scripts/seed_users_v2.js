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

const DATA_NEW = `
Biotech	Third	1
CSAI	Second	1
CSAI	Second	2
CSAI	Third	1
CSAI	Third	2
CSAI	Fourth	1
CSDS	Second	1
CSDS	Third	1
CSE	Second	1
CSE	Second	2
CSE	Second	3
CSE	Third	1
CSE	Third	2
CSE	Third	3
EE	Second	2
EVDT	Second	1
IT	Second	1
IT	Second	1
IT	Third	2
IT	Third	1
ITNS	Second	1
ITNS	Third	1
MAC	Third	1
MAC	Second	1
Masters in Chemistry	First	1
PIT	First	1
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

const YEAR_MAP = {
  'First': 1,
  'Second': 2,
  'Third': 3,
  'Fourth': 4
};

const parseData = (raw, defaultYear = null) => {
  return raw.trim().split('\n').filter(Boolean).map(line => {
    line = line.trim();
    
    let branch, year, section;

    // Handle Tab-separated structured data: "Branch Year Section"
    if (line.includes('\t')) {
      const parts = line.split('\t').map(p => p.trim());
      branch = parts[0];
      year = YEAR_MAP[parts[1]] || parseInt(parts[1]) || defaultYear;
      section = parts[2] || '1';
    } else {
      // Handle legacy format: "BranchSection"
      const match = line.match(/^(.+?)(\d+)$/);
      if (match) {
        branch = match[1].trim();
        section = match[2].trim();
      } else {
        branch = line;
        section = '1';
      }
      year = defaultYear;
    }

    const branchSlug = branch.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_');
    
    const branchPassword = branch.toLowerCase()
      .replace(/[^\w]/g, '');

    const email = `${branchSlug}_${year}_${section}@nsut.ac.in`;
    const name = `${branch}-${section} Year ${year}`;
    const password = `${branchPassword}${year}${section}-${random4Digits()}`;
    
    return { name, email, password, year, section: parseInt(section) };
  });
};

async function seedUsers() {
  const usersNew = parseData(DATA_NEW);
  const usersYear4 = parseData(DATA_YEAR_4, 4);
  const allUsers = [...usersNew, ...usersYear4];

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

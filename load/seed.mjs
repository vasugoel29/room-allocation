// Builds roomdb_load_test at campus scale and writes signed tokens for k6 to load/.data/tokens.json.
//   node load/seed.mjs [--students 3000] [--reps 300] [--faculty 150] [--rooms 150] [--bookings 5000]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { LOAD_DB_URL, LOAD_JWT_SECRET } from './env.mjs';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../backend/package.json'));
const pg = require('pg');
const jwt = require('jsonwebtoken');

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const N = {
  students: arg('students', 3000),
  reps: arg('reps', 300),
  faculty: arg('faculty', 150),
  admins: 5,
  rooms: arg('rooms', 150),
  bookings: arg('bookings', 5000),
};

process.env.TEST_DATABASE_URL = LOAD_DB_URL;
const { default: globalSetup } = await import('../backend/test/global-setup.js');
await globalSetup();

const db = new pg.Client({ connectionString: LOAD_DB_URL });
await db.connect();
// Deterministic: a fixed-seed PRNG (mulberry32) instead of Math.random, so the same flags always
// produce the same database (dates are relative to today, IST).
let prng = 0x2f6b9a1d;
const random = () => {
  prng = (prng + 0x6d2b79f5) | 0;
  let t = Math.imul(prng ^ (prng >>> 15), 1 | prng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// What the ACL would grant each role (CRAS has no role-based access of its own).
const { SUGGESTED_BUNDLES } = await import('../backend/src/auth/permissions.js');

async function bulkUsers(role, n) {
  const ids = [];
  for (let off = 0; off < n; off += 1000) {
    const k = Math.min(1000, n - off);
    const vals = [];
    const params = [];
    for (let i = 0; i < k; i++) {
      const j = off + i;
      params.push(`Load ${role} ${j}`, `load.${role.toLowerCase()}.${j}@nsut.ac.in`, role);
      const b = params.length - 2;
      vals.push(`($${b}, $${b + 1}, $${b + 2}, true)`);
    }
    const { rows } = await db.query(
      `INSERT INTO users (name, email, role, is_approved) VALUES ${vals.join(',')} RETURNING id, name, email, role`,
      params,
    );
    ids.push(...rows);
    await db.query(
      `INSERT INTO user_access (user_id, acl_id, role, roles, permissions, fetched_at)
       SELECT u.id, 'load_' || u.id, u.role, jsonb_build_array(u.role), $2::jsonb, NOW() FROM users u WHERE u.id = ANY($1)`,
      [rows.map((r) => r.id), JSON.stringify(SUGGESTED_BUNDLES[role])],
    );
  }
  return ids;
}

const blocks = ['4th Block', '5th Block', '6th Block', '8th Block', 'APJ Block'];
const roomRows = [];
for (let i = 0; i < N.rooms; i++) {
  const { rows } = await db.query(
    `INSERT INTO rooms (name, building, floor, capacity, type, has_ac, has_projector)
     VALUES ($1, $2, $3, $4, 'Lecture Room', $5, $6) RETURNING id, name`,
    [`L${i}`, blocks[i % blocks.length], i % 4, [40, 60, 80, 120][i % 4], i % 2 === 0, i % 3 === 0],
  );
  roomRows.push(rows[0]);
}

const students = await bulkUsers('VIEWER', N.students);
const reps = await bulkUsers('STUDENT_REP', N.reps);
const faculty = await bulkUsers('FACULTY', N.faculty);
const admins = await bulkUsers('ADMIN', N.admins);
// Each faculty account gets its directory entry; student bookings must name one (Phase 4).
for (const f of faculty) {
  const { rows: [entry] } = await db.query(
    'INSERT INTO faculties (name, email, user_id) VALUES ($1, $2, $3) RETURNING id', [f.name, f.email, f.id],
  );
  f.faculty_id = entry.id;
}

// Historical + upcoming bookings spread over -60..+7 days, 08:00–17:00 IST, no overlaps per room/hour.
const IST = 5.5 * 3600_000;
const today = new Date(Date.now() + IST).toISOString().slice(0, 10);
const used = new Set();
let made = 0;
while (made < N.bookings) {
  const room = roomRows[Math.floor(random() * roomRows.length)];
  const dayOff = Math.floor(random() * 67) - 60;
  const hour = 8 + Math.floor(random() * 10);
  const key = `${room.id}:${dayOff}:${hour}`;
  if (used.has(key)) continue;
  used.add(key);
  const [y, m, d] = today.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d + dayOff, hour) - IST);
  const rep = reps[Math.floor(random() * reps.length)];
  const ukey = `${rep.id}:${dayOff}:${hour}`;
  if (used.has(ukey)) continue;
  used.add(ukey);
  await db.query(
    `INSERT INTO bookings (room_id, created_by, start_time, end_time, purpose, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [room.id, rep.id, start, new Date(start.getTime() + 3600_000), `Load booking ${made}`, dayOff < 0 || random() > 0.1 ? 'ACTIVE' : 'CANCELLED'],
  );
  made++;
}
await db.end();

const sign = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role, name: u.name }, LOAD_JWT_SECRET, { expiresIn: '6h' });
const out = {
  students: students.slice(0, 2000).map((u) => ({ id: u.id, email: u.email, token: sign(u) })),
  reps: reps.map((u) => ({ id: u.id, email: u.email, token: sign(u) })),
  faculty: faculty.map((u) => ({ id: u.id, email: u.email, faculty_id: u.faculty_id, token: sign(u) })),
  admins: admins.map((u) => ({ id: u.id, email: u.email, token: sign(u) })),
  rooms: roomRows,
  today,
};
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.data');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(out));
console.log(`load DB ready: ${N.rooms} rooms, ${N.students} students, ${N.reps} reps, ${N.faculty} faculty, ${N.bookings} bookings`);
process.exit(0);

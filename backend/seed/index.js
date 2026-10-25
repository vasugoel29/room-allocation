/**
 * CRAS seeder — deterministic, idempotent and self-contained.
 *
 *   npm run seed                      rooms + faculty directory (safe to re-run)
 *   npm run seed -- --demo-timetable  ...plus the small demo timetable (dev/test only)
 *   NODE_ENV=production npm run seed -- --confirm-production   bootstrap a production database
 *
 * - All data is defined in ./data (no files are read, nothing is random).
 * - Rooms are upserted by name (case-insensitive) and faculty by email, so a second run changes
 *   nothing. Rows an admin deactivated are left deactivated (reported, never revived). Nothing is
 *   ever deleted. Users are never seeded: people appear when the college ACL validates them.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import '../src/config/env.js';
import * as db from '../src/db.js';
import { facultyRepository } from '../src/repositories/facultyRepository.js';
import { importSectionSlots } from '../src/services/timetableImport.js';
import { ROOMS } from './data/rooms.js';
import { FACULTIES } from './data/faculties.js';
import { DEMO_TIMETABLE } from './data/demoTimetable.js';

const ROOM_FIELDS = ['building', 'floor', 'capacity', 'type', 'has_ac', 'has_projector', 'student_access', 'description'];

async function seedRooms(client) {
  const counts = { created: 0, updated: 0, unchanged: 0, deactivated_kept: 0 };
  for (const room of ROOMS) {
    const { rows: [existing] } = await client.query(
      'SELECT * FROM rooms WHERE lower(name) = lower($1) ORDER BY is_active DESC, id LIMIT 1', [room.name],
    );
    if (!existing) {
      await client.query(
        `INSERT INTO rooms (name, ${ROOM_FIELDS.join(', ')}) VALUES ($1, ${ROOM_FIELDS.map((_, i) => `$${i + 2}`).join(', ')})`,
        [room.name, ...ROOM_FIELDS.map((f) => room[f])],
      );
      counts.created++;
    } else if (!existing.is_active) {
      counts.deactivated_kept++;
    } else if (ROOM_FIELDS.some((f) => existing[f] !== room[f])) {
      await client.query(
        `UPDATE rooms SET ${ROOM_FIELDS.map((f, i) => `${f} = $${i + 2}`).join(', ')} WHERE id = $1`,
        [existing.id, ...ROOM_FIELDS.map((f) => room[f])],
      );
      counts.updated++;
    } else {
      counts.unchanged++;
    }
  }
  return counts;
}

async function seedFaculties(client) {
  const counts = { created: 0, updated: 0, unchanged: 0, deactivated_kept: 0 };
  for (const f of FACULTIES) {
    const { rows: [existing] } = await client.query('SELECT * FROM faculties WHERE lower(email) = lower($1)', [f.email]);
    if (existing && !existing.is_active) { counts.deactivated_kept++; continue; }
    if (existing && existing.name === f.name && (existing.department_name ?? null) === f.department_name && existing.department_name && existing.department_name !== 'General') {
      counts.unchanged++;
      continue;
    }
    const saved = await facultyRepository.upsert(f, client);
    if (saved.inserted) counts.created++; else counts.updated++;
  }
  // Auto-link any matching user accounts that exist without a directory link
  await client.query(`
    UPDATE faculties f
    SET user_id = u.id, updated_at = NOW()
    FROM users u
    WHERE f.user_id IS NULL AND lower(f.email) = lower(u.email);
  `);
  return counts;
}

export async function seed({ demoTimetable = false } = {}) {
  return db.runInTransaction(async (client) => {
    const result = { rooms: await seedRooms(client), faculties: await seedFaculties(client) };
    if (demoTimetable) result.demoTimetable = await importSectionSlots(client, DEMO_TIMETABLE);
    return result;
  });
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const production = process.env.NODE_ENV === 'production';
  if (production && !args.has('--confirm-production')) {
    console.error('Refusing to seed a production database without --confirm-production.');
    process.exit(1);
  }
  if (production && args.has('--demo-timetable')) {
    console.error('The demo timetable is for development and tests only; production timetables come from the admin import.');
    process.exit(1);
  }
  await db.connectAndMigrate();
  const result = await seed({ demoTimetable: args.has('--demo-timetable') });
  console.log(JSON.stringify(result, null, 2));
  await db.pool.end();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(async (err) => {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
    await db.pool.end().catch(() => {});
  });
}

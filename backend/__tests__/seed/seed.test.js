// The seeder is deterministic, idempotent and self-contained (no files, no randomness).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import * as db from '../../src/db.js';
import { seed } from '../../seed/index.js';
import { ROOMS } from '../../seed/data/rooms.js';
import { FACULTIES } from '../../seed/data/faculties.js';
import { DEMO_TIMETABLE } from '../../seed/data/demoTimetable.js';
import { closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

const snapshot = async () => {
  const rooms = (await db.query(
    `SELECT name, building, floor, capacity, type, has_ac, has_projector, student_access, description, is_active
       FROM rooms WHERE lower(name) = ANY($1) ORDER BY lower(name)`, [ROOMS.map((r) => r.name.toLowerCase())],
  )).rows;
  const faculties = (await db.query(
    `SELECT name, lower(email) AS email, department_name, is_active FROM faculties WHERE lower(email) = ANY($1) ORDER BY lower(email)`,
    [FACULTIES.map((f) => f.email)],
  )).rows;
  const slots = (await db.query(
    `SELECT department, semester, section, day_of_week, slot_time, start_min, end_min, subject_code, room_name, faculty_name,
            room_id, faculty_id, is_active
       FROM timetable_slots WHERE subject_code = ANY($1) ORDER BY 1, 2, 3, 4, 6, 8, 9`, [DEMO_TIMETABLE.map((s) => s.subject_code)],
  )).rows;
  return crypto.createHash('sha256').update(JSON.stringify({ rooms, faculties, slots })).digest('hex');
};

describe('seed', () => {
  test('seeds every room and faculty member; a second run changes nothing (identical tables)', async () => {
    const first = await seed({ demoTimetable: true });
    expect(first.rooms.created + first.rooms.updated + first.rooms.unchanged + first.rooms.deactivated_kept).toBe(ROOMS.length);
    expect(first.faculties.created + first.faculties.updated + first.faculties.unchanged + first.faculties.deactivated_kept).toBe(FACULTIES.length);
    // The demo timetable names only seeded rooms and faculty: every class is linked by id.
    expect(first.demoTimetable).toMatchObject({ sections: 2, rejected: [], unresolved: { rooms: [], faculty: [] } });
    const after1 = await snapshot();

    const second = await seed({ demoTimetable: true });
    expect(second.rooms).toEqual({ created: 0, updated: 0, unchanged: ROOMS.length - first.rooms.deactivated_kept, deactivated_kept: first.rooms.deactivated_kept });
    expect(second.faculties).toMatchObject({ created: 0, updated: 0 });
    expect(second.demoTimetable).toEqual({
      sections: 2, inserted: 0, unchanged: DEMO_TIMETABLE.length, deactivated: 0, rejected: [], unresolved: { rooms: [], faculty: [] },
    });
    expect(await snapshot()).toBe(after1);
  });

  test('rows an admin deactivated stay deactivated; nothing is deleted', async () => {
    const [room] = ROOMS;
    const [fac] = FACULTIES;
    await db.query('UPDATE rooms SET is_active = FALSE, deactivated_at = NOW() WHERE lower(name) = lower($1)', [room.name]);
    await db.query('UPDATE faculties SET is_active = FALSE, deactivated_at = NOW() WHERE lower(email) = $1', [fac.email]);
    const before = Number((await db.query('SELECT count(*) FROM rooms')).rows[0].count);

    const res = await seed();
    expect(res.rooms.deactivated_kept).toBeGreaterThanOrEqual(1);
    expect(res.faculties.deactivated_kept).toBeGreaterThanOrEqual(1);
    expect((await db.query('SELECT is_active FROM rooms WHERE lower(name) = lower($1)', [room.name])).rows[0].is_active).toBe(false);
    expect((await db.query('SELECT is_active FROM faculties WHERE lower(email) = $1', [fac.email])).rows[0].is_active).toBe(false);
    expect(Number((await db.query('SELECT count(*) FROM rooms')).rows[0].count)).toBe(before);

    await db.query('UPDATE rooms SET is_active = TRUE, deactivated_at = NULL WHERE lower(name) = lower($1)', [room.name]);
    await db.query('UPDATE faculties SET is_active = TRUE, deactivated_at = NULL WHERE lower(email) = $1', [fac.email]);
  });

  test('an edited seeded room is put back to the code definition (the code is the reference)', async () => {
    const [, room] = ROOMS;
    await db.query('UPDATE rooms SET capacity = 1 WHERE lower(name) = lower($1)', [room.name]);
    const res = await seed();
    expect(res.rooms.updated).toBe(1);
    expect((await db.query('SELECT capacity FROM rooms WHERE lower(name) = lower($1)', [room.name])).rows[0].capacity).toBe(room.capacity);
  });

  test('the seed data is well-formed: unique names/emails, institutional emails, demo rooms and faculty exist', () => {
    expect(new Set(ROOMS.map((r) => r.name.toLowerCase())).size).toBe(ROOMS.length);
    expect(new Set(FACULTIES.map((f) => f.email)).size).toBe(FACULTIES.length);
    expect(FACULTIES.every((f) => /^[^\s@]+@[^\s@]+\.[a-z]+$/.test(f.email) && f.email === f.email.toLowerCase())).toBe(true);
    const roomNames = new Set(ROOMS.map((r) => r.name));
    const facultyNames = new Set(FACULTIES.map((f) => f.name));
    for (const s of DEMO_TIMETABLE) {
      expect(roomNames.has(s.room_name)).toBe(true);
      expect(facultyNames.has(s.faculty_name)).toBe(true);
    }
  });
});

describe('self-contained: no file reads, no randomness', () => {
  const backend = path.resolve(process.cwd());
  const sources = [
    path.join(backend, 'src/db.js'),
    ...fs.readdirSync(path.join(backend, 'seed'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(backend, 'seed', f)),
    ...fs.readdirSync(path.join(backend, 'scripts'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join(backend, 'scripts', f)),
  ];

  test.each(sources.map((f) => [path.relative(backend, f), f]))('%s reads no files and uses no randomness', (_rel, file) => {
    const code = fs.readFileSync(file, 'utf8');
    expect(code).not.toMatch(/\breadFile(Sync)?\s*\(|createReadStream|readdirSync|XLSX\.read|require\(['"][^'"]+\.json['"]\)/);
    expect(code).not.toMatch(/Math\.random|crypto\.random|randomUUID|faker/);
  });
});

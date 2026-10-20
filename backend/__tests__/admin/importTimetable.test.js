// POST /api/admin/uploads/import/timetable and GET /api/admin/uploads/export/timetable.
// The import soft-deletes every active faculty_timetable_slots row (is_active=false) before inserting the
// new timetable, so every timetable-dependent test lives in this file.
import request from 'supertest';
import XLSX from 'xlsx-js-style';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createRoom, createFacultyEntry, closeDb } from '../../test/helpers/factories.js';
import { uniq, runImport, binaryParser } from './helpers.js';

const HEADER = 'faculty_name,semester,day_of_week,slot_time,content,is_occupied,room_id';

let admin;
beforeAll(async () => {
  admin = await createAdmin();
});
afterAll(closeDb);

const slots = async () => (await db.query('SELECT faculty_name, semester, day_of_week, slot_time, content, is_occupied, room_id FROM faculty_timetable_slots WHERE is_active ORDER BY id')).rows;
// What the calendar shows for a room: hours taken by classes (from the timetables) and admin blocks.
const calendar = async (roomId) => (await request(app).get('/api/availability').set('Authorization', admin.auth)).body
  .filter((r) => r.room_id === roomId).map(({ day, hour, source }) => ({ day, hour, source }));
const derivedRows = async (roomId) => Number((await db.query('SELECT count(*) FROM room_availability WHERE room_id = $1', [roomId])).rows[0].count);

const exportTimetable = (view) => request(app)
  .get('/api/admin/uploads/export/timetable')
  .query(view ? { view } : {})
  .set('Authorization', admin.auth)
  .buffer(true)
  .parse(binaryParser);

test('imports slots, replaces the previous timetable; an occupied slot blocks its room through the timetable itself', async () => {
  const room = await createRoom();
  const prof = (await createFacultyEntry({ name: `Prof Import ${uniq()}` })).name;
  const oldProf = `Old Prof ${uniq()}`;
  await runImport(app, admin.auth, 'timetable', `${HEADER}\n${oldProf},2,Tue,10:00-11:00,Old,true,\n`);
  const { rows: [oldSlot] } = await db.query('SELECT id FROM faculty_timetable_slots WHERE faculty_name = $1 AND is_active', [oldProf]);
  expect(oldSlot).toBeDefined();

  const csv = [
    HEADER,
    `${prof},4,Mon,09:00-10:00,CS201 Data Structures,true,${room.id}`,
    `${prof},4,Wed,11:00-12:00,CS202 Lab,1,`,
    `${prof},6,Thu,12:00-13:00,Free,false,abc`,
    `,4,Fri,09:00-10:00,No faculty -> skipped,true,${room.id}`,
  ].join('\n');
  const { post, job } = await runImport(app, admin.auth, 'timetable', csv);
  expect(post.status).toBe(202);
  expect(job).toEqual({
    status: 'completed', message: 'Imported 3 timetable records, 1 skipped',
    skipped: [{ line: 5, reason: 'missing faculty_name' }], unresolved: [],
  });

  expect(await slots()).toEqual([
    { faculty_name: prof, semester: '4', day_of_week: 'Mon', slot_time: '09:00-10:00', content: 'CS201 Data Structures', is_occupied: true, room_id: room.id },
    { faculty_name: prof, semester: '4', day_of_week: 'Wed', slot_time: '11:00-12:00', content: 'CS202 Lab', is_occupied: true, room_id: null },
    { faculty_name: prof, semester: '6', day_of_week: 'Thu', slot_time: '12:00-13:00', content: 'Free', is_occupied: false, room_id: null },
  ]);
  const { rows: linked } = await db.query('SELECT DISTINCT faculty_id FROM faculty_timetable_slots WHERE faculty_name = $1 AND is_active', [prof]);
  expect(linked).toEqual([{ faculty_id: expect.any(Number) }]);
  expect(await calendar(room.id)).toEqual([{ day: 'Mon', hour: 9, source: 'class' }]);
  expect(await derivedRows(room.id)).toBe(0); // nothing is copied into room_availability

  // The previous timetable is soft-deleted, not removed.
  const { rows: [old] } = await db.query('SELECT * FROM faculty_timetable_slots WHERE id = $1', [oldSlot.id]);
  expect(old).toMatchObject({ faculty_name: oldProf, content: 'Old', is_active: false });
  expect(old.deactivated_at).not.toBeNull();
  // ...and hidden from the admin slot list.
  const list = await request(app).get('/api/timetable/slots').query({ faculty_name: oldProf }).set('Authorization', admin.auth);
  expect(list.status).toBe(200);
  expect(JSON.stringify(list.body)).not.toContain(oldProf);

  const audit = await db.query("SELECT details FROM audit_logs WHERE action = 'IMPORT_TIMETABLE_CSV' AND user_id = $1 ORDER BY id DESC LIMIT 1", [admin.user.id]);
  expect(audit.rows[0].details).toEqual({ recordCount: 4, imported: 3, skipped: 1, unresolved: 0 });
});

test('unreadable days and times are skipped with the reason; names outside the faculty directory are reported', async () => {
  const stranger = `Prof Unknown ${uniq()}`;
  const csv = [HEADER, `${stranger},4,Mon,09:00-10:00,A,true,`, `${stranger},4,Funday,09:00-10:00,B,true,`, `${stranger},4,Tue,nine,C,true,`].join('\n');
  const { job } = await runImport(app, admin.auth, 'timetable', csv);
  expect(job).toMatchObject({
    status: 'completed',
    skipped: [{ line: 3, reason: 'day_of_week must be a weekday (Mon–Sun)' }, { line: 4, reason: 'slot_time must look like 09:00-10:00' }],
    unresolved: [stranger],
  });
  expect(job.message).toMatch(/1 faculty name\(s\) not in the directory/);
  expect((await slots()).map((r) => r.content)).toEqual(['A']);
});

test('a failing import (unknown room_id) rolls back and keeps the existing timetable', async () => {
  const prof = `Prof Keep ${uniq()}`;
  await runImport(app, admin.auth, 'timetable', `${HEADER}\n${prof},2,Mon,09:00-10:00,Keep me,true,\n`);
  const before = await slots();

  const { job } = await runImport(app, admin.auth, 'timetable', `${HEADER}\nProf Broken,2,Mon,09:00-10:00,Bad room,true,99999999\n`);
  expect(job.status).toBe('failed');
  expect(job.error).toEqual(expect.any(String));
  expect(await slots()).toEqual(before);
});

test('[OPS-05] 12-hour afternoon slot times ("02:00-03:00") block the room at 14:00, not 02:00; a 2-hour slot blocks both hours', async () => {
  const room = await createRoom();
  const csv = [HEADER, `Prof PM ${uniq()},4,Tue,02:00-03:00,Afternoon class,true,${room.id}`, `Prof PM ${uniq()},4,Wed,09:00-11:00,Lab,true,${room.id}`].join('\n');
  const { job } = await runImport(app, admin.auth, 'timetable', csv);
  expect(job.status).toBe('completed');
  expect(await calendar(room.id)).toEqual([
    { day: 'Tue', hour: 14, source: 'class' }, { day: 'Wed', hour: 9, source: 'class' }, { day: 'Wed', hour: 10, source: 'class' },
  ]);
});

test('[OPS-05] re-importing a timetable frees rooms the new timetable no longer uses', async () => {
  const room = await createRoom();
  await runImport(app, admin.auth, 'timetable', `${HEADER}\nProf Moving ${uniq()},4,Mon,10:00-11:00,Old slot,true,${room.id}\n`);
  expect(await calendar(room.id)).toEqual([{ day: 'Mon', hour: 10, source: 'class' }]);

  const { job } = await runImport(app, admin.auth, 'timetable', `${HEADER}\nProf Moving ${uniq()},4,Mon,10:00-11:00,Now unassigned,true,\n`);
  expect(job.status).toBe('completed');
  expect(await calendar(room.id)).toEqual([]);
});

describe('GET /api/admin/uploads/export/timetable', () => {
  let room;
  let prof;
  beforeAll(async () => {
    room = await createRoom();
    prof = `Prof Export ${uniq()}`;
    const csv = [
      HEADER,
      `${prof},4,Mon,09:00-10:00,CS301 OS,true,${room.id}`,
      `${prof},4,Fri,02:00-03:00,CS302 Networks,true,${room.id}`,
    ].join('\n');
    const { job } = await runImport(app, admin.auth, 'timetable', csv);
    expect(job.status).toBe('completed');
  });

  test('faculty view (default): one sheet per faculty with an 08:00-17:00 x Mon-Fri grid', async () => {
    const res = await exportTimetable();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename=faculty_timetable_calendar.xlsx');
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const sheetName = `Faculty - ${prof}`.slice(0, 31);
    expect(wb.SheetNames).toContain(sheetName);
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    expect(grid[0][0]).toBe(`Weekly Timetable — Faculty - ${prof}`);
    expect(grid[1]).toEqual(['Time', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    const row9 = grid.find((r) => r[0] === '09:00');
    expect(row9[1]).toBe(`CS301 OS\nRoom: ${room.name}\nSemester: 4`);
    // The export (unlike the import's room_availability sync) maps 02:00 to the 14:00 row.
    const row14 = grid.find((r) => r[0] === '14:00');
    expect(row14[5]).toContain('CS302 Networks');
  });

  test('room view: one sheet per room with a Mon-Fri x 08:00-17:00 grid', async () => {
    const res = await exportTimetable('room');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename=room_timetable_calendar.xlsx');
    const wb = XLSX.read(res.body, { type: 'buffer' });
    const sheetName = `Room - ${room.name}`.slice(0, 31);
    expect(wb.SheetNames).toContain(sheetName);
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    expect(grid[1][0]).toBe('Day');
    const mon = grid.find((r) => r[0] === 'Monday');
    expect(mon[grid[1].indexOf('09:00')]).toBe(`CS301 OS\nFaculty: ${prof}`);
  });

  test('empty timetable still yields a valid workbook with a placeholder sheet', async () => {
    // Replace the timetable with rows that are all skipped (no faculty_name) -> empty table.
    const { job } = await runImport(app, admin.auth, 'timetable', `${HEADER}\n,1,Mon,09:00-10:00,x,true,\n`);
    expect(job.status).toBe('completed');
    const res = await exportTimetable('room');
    expect(res.status).toBe(200);
    const wb = XLSX.read(res.body, { type: 'buffer' });
    expect(wb.SheetNames).toEqual(['Timetable']);
  });
});

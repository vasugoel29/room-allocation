// POST /api/admin/uploads/import/faculty (async CSV import via `csvContent`) and
// GET /api/admin/uploads/status/:jobId. The students import was removed (student identity and
// academic profile come from the ACL); its 404 is asserted in security.test.js.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, createViewer, closeDb } from '../../test/helpers/factories.js';
import { uniq, pollJob, runImport } from './helpers.js';

let admin;
beforeAll(async () => {
  admin = await createAdmin();
});
afterAll(closeDb);

const userByEmail = async (email) => (await db.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
const email = (tag) => `imp.${tag}.${uniq()}@nsut.ac.in`;

describe('job lifecycle', () => {
  test.each(['faculty', 'timetable'])('%s import without csvContent -> 400', async (kind) => {
    const res = await request(app).post(`/api/admin/uploads/import/${kind}`).set('Authorization', admin.auth).send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Missing csvContent field' });
  });

  test('unknown job id -> 404', async () => {
    const res = await request(app).get('/api/admin/uploads/status/00000000-0000-0000-0000-000000000000').set('Authorization', admin.auth);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Job not found' });
  });

  test('202 with a jobId; a finished job is reported once and then forgotten', async () => {
    const post = await request(app).post('/api/admin/uploads/import/faculty').set('Authorization', admin.auth)
      .send({ csvContent: `name,email\nLifecycle Prof,${email('life')}\n` });
    expect(post.status).toBe(202);
    expect(post.body).toEqual({ jobId: expect.stringMatching(/^[0-9a-f-]{36}$/), status: 'processing' });
    const job = await pollJob(app, admin.auth, post.body.jobId);
    expect(job).toEqual({
      status: 'completed', message: 'Faculty directory updated: 1 added, 0 updated, 0 deactivated, 0 skipped',
      created: 1, updated: 0, deactivated: 0, skipped: [],
    });
    const again = await request(app).get(`/api/admin/uploads/status/${post.body.jobId}`).set('Authorization', admin.auth);
    expect(again.status).toBe(404);
  });
});

const facultyByEmail = async (email) => (await db.query('SELECT * FROM faculties WHERE lower(email) = lower($1)', [email])).rows[0];

describe('faculty import (faculty directory)', () => {
  test('creates faculty-directory entries (no user account, no password); re-import updates name/department', async () => {
    const e = email('fac');
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email,department_name,password\nDr. Meera Iyer,${e.toUpperCase()},Department Of Electrical Engineering (EE),Fac@pass1\n`);
    expect(job).toMatchObject({ status: 'completed', created: 1, updated: 0, deactivated: 0, skipped: [] });
    const entry = await facultyByEmail(e);
    expect(entry).toMatchObject({
      name: 'Dr. Meera Iyer', email: e, department_name: 'Department Of Electrical Engineering (EE)',
      is_active: true, deactivated_at: null, user_id: null,
    });
    expect(await userByEmail(e)).toBeUndefined(); // no sign-in account is created

    const { job: job2 } = await runImport(app, admin.auth, 'faculty', `name,email,department_name\nDr. Meera Iyer-Rao,${e},Department Of Mechanical Engineering (ME)\n`);
    expect(job2).toMatchObject({ status: 'completed', created: 0, updated: 1, deactivated: 0 });
    expect(await facultyByEmail(e)).toMatchObject({
      id: entry.id, name: 'Dr. Meera Iyer-Rao', department_name: 'Department Of Mechanical Engineering (ME)', is_active: true,
    });
    expect((await db.query('SELECT COUNT(*)::int AS n FROM faculties WHERE lower(email) = $1', [e])).rows[0].n).toBe(1);
  });

  test('re-import keeps the link to an existing sign-in account', async () => {
    const fac = await createFaculty();
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\nRenamed Prof,${fac.user.email}\n`);
    expect(job).toMatchObject({ status: 'completed', updated: 1 });
    expect(await facultyByEmail(fac.user.email)).toMatchObject({ id: fac.faculty.id, name: 'Renamed Prof', user_id: fac.user.id });
  });

  test('status=inactive soft-deletes the entry (row kept); a later active row reactivates it', async () => {
    const e = email('facoff');
    await runImport(app, admin.auth, 'faculty', `name,email\nLeaving Prof,${e}\n`);
    const before = await facultyByEmail(e);
    const room = (await db.query('INSERT INTO rooms (name, building, floor, capacity, type) VALUES ($1, $2, 1, 10, $3) RETURNING id',
      [`FI-${uniq()}`.slice(0, 32), 'Test Block', 'Lecture Room'])).rows[0];
    const { rows: [booking] } = await db.query(
      `INSERT INTO bookings (room_id, created_by, start_time, end_time, purpose, status, faculty_id)
       VALUES ($1, $2, NOW() - interval '3 days', NOW() - interval '3 days' + interval '1 hour', 'hist', 'COMPLETED', $3) RETURNING id`,
      [room.id, admin.user.id, before.id]);

    const { job } = await runImport(app, admin.auth, 'faculty', `name,email,department_name,status\nLeaving Prof,${e},,inactive\n`);
    expect(job).toMatchObject({ status: 'completed', created: 0, updated: 0, deactivated: 1, skipped: [] });
    const after = await facultyByEmail(e);
    expect(after).toMatchObject({ id: before.id, is_active: false });
    expect(after.deactivated_at).not.toBeNull();
    // History keeps pointing at the entry.
    expect((await db.query('SELECT faculty_id FROM bookings WHERE id = $1', [booking.id])).rows[0].faculty_id).toBe(before.id);
    // Hidden from the faculty picker.
    const list = await request(app).get('/api/auth/faculties').set('Authorization', admin.auth);
    expect(list.body.map((f) => f.id)).not.toContain(before.id);

    // Deactivating again is a no-op.
    const { job: again } = await runImport(app, admin.auth, 'faculty', `name,email,status\nLeaving Prof,${e},inactive\n`);
    expect(again).toMatchObject({ status: 'completed', deactivated: 0 });

    const { job: back } = await runImport(app, admin.auth, 'faculty', `name,email,status\nLeaving Prof,${e},active\n`);
    expect(back).toMatchObject({ status: 'completed', updated: 1 });
    expect(await facultyByEmail(e)).toMatchObject({ id: before.id, is_active: true, deactivated_at: null });
  });

  test('invalid emails, missing names and duplicate emails are skipped with line numbers; other rows import', async () => {
    const good = email('facgood');
    const dup = email('facdup');
    const csv = [
      'name,email,department_name',
      `Good Prof,${good},Dept A`, // line 2
      'Bad Mail Prof,not-an-email,Dept A', // line 3
      `,${email('noname')},Dept A`, // line 4
      `Dup First,${dup},Dept A`, // line 5
      `Dup Second,${dup.toUpperCase()},Dept B`, // line 6
      'No Mail Prof,,Dept A', // line 7
    ].join('\n');
    const { job } = await runImport(app, admin.auth, 'faculty', csv);
    expect(job).toMatchObject({ status: 'completed', created: 2, updated: 0, deactivated: 0 });
    expect(job.skipped).toEqual([
      { line: 3, reason: 'invalid or missing email' },
      { line: 4, reason: 'missing name' },
      { line: 6, reason: 'duplicate of line 5' },
      { line: 7, reason: 'invalid or missing email' },
    ]);
    expect(job.message).toBe('Faculty directory updated: 2 added, 0 updated, 0 deactivated, 4 skipped');
    expect(await facultyByEmail(good)).toMatchObject({ name: 'Good Prof' });
    expect(await facultyByEmail(dup)).toMatchObject({ name: 'Dup First', department_name: 'Dept A' });
    expect((await db.query("SELECT 1 FROM faculties WHERE name IN ('Bad Mail Prof', 'No Mail Prof')")).rowCount).toBe(0);
  });

  test.failing('[OPS-09] department_id is populated for imported faculty', async () => {
    const dept = (await db.query('SELECT id, name FROM departments WHERE is_active ORDER BY id LIMIT 1')).rows[0];
    const e = email('facdept');
    await runImport(app, admin.auth, 'faculty', `name,email,department_name\nDept Prof,${e},${dept.name}\n`);
    expect((await facultyByEmail(e)).department_id).toBe(dept.id);
  });

  // Previously the faculty import upserted into users and silently rewrote a student's name while
  // leaving them a VIEWER. The import now only touches the faculty directory.
  test('[NEW-admin-6] a faculty import that hits an existing student email leaves the student account untouched', async () => {
    const e = email('stu2fac');
    await createViewer({ name: 'A Student', email: e });
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\nA Professor,${e}\n`);
    expect(job.status).toBe('completed');
    expect(await userByEmail(e)).toMatchObject({ name: 'A Student', role: 'VIEWER' });
    expect(await facultyByEmail(e)).toMatchObject({ name: 'A Professor', is_active: true });
  });

  // parseCSV toggles quote state on every `"`, so RFC 4180 escaped quotes ("") vanish.
  test.failing('[NEW-admin-5] escaped double quotes in a quoted field are preserved', async () => {
    const e = email('quote');
    await runImport(app, admin.auth, 'faculty', `name,email\n"Tom ""TJ"" Jones",${e}\n`);
    expect((await facultyByEmail(e)).name).toBe('Tom "TJ" Jones');
  });

  test('a quoted field containing a comma is kept whole', async () => {
    const e = email('comma');
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\n"Kumar, Ravi",${e}\n`);
    expect(job).toMatchObject({ status: 'completed', created: 1 });
    expect((await facultyByEmail(e)).name).toBe('Kumar, Ravi');
  });

  // Excel's "CSV UTF-8" output starts with a BOM; header trim() happens to strip it.
  test('a UTF-8 BOM at the start of the file does not drop the first column', async () => {
    const e = email('bom');
    const { job } = await runImport(app, admin.auth, 'faculty', `\uFEFFname,email\nBom Prof,${e}\n`);
    expect(job).toMatchObject({ status: 'completed', created: 1 });
    expect((await facultyByEmail(e)).name).toBe('Bom Prof');
  });

  test('a payload just under the 100kb JSON limit is accepted', async () => {
    const line = `${'x'.repeat(90)},\n`; // name only, no email -> skipped, keeps the job cheap
    const csv = `name,email\n${line.repeat(Math.floor(95_000 / line.length))}`;
    const { post, job } = await runImport(app, admin.auth, 'faculty', csv);
    expect(post.status).toBe(202);
    expect(job.status).toBe('completed');
  });

  test.failing('[OPS-06] a realistic bulk CSV just over 100kb is accepted (not 413)', async () => {
    const line = `${'x'.repeat(90)},\n`;
    const csv = `name,email\n${line.repeat(Math.ceil(110_000 / line.length))}`;
    expect(Buffer.byteLength(JSON.stringify({ csvContent: csv }))).toBeGreaterThan(100 * 1024);
    const res = await request(app).post('/api/admin/uploads/import/faculty').set('Authorization', admin.auth).send({ csvContent: csv });
    expect(res.status).toBe(202);
    if (res.status === 202) await pollJob(app, admin.auth, res.body.jobId);
  });
});

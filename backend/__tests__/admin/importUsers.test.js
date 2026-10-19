// POST /api/admin/uploads/import/{students,faculty} (async CSV import via `csvContent`) and
// GET /api/admin/uploads/status/:jobId.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createFaculty, closeDb, TEST_PASSWORD } from '../../test/helpers/factories.js';
import { uniq, pollJob, runImport } from './helpers.js';

let admin;
beforeAll(async () => {
  admin = await createAdmin();
});
afterAll(closeDb);

const userByEmail = async (email) => (await db.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const email = (tag) => `imp.${tag}.${uniq()}@nsut.ac.in`;

describe('job lifecycle', () => {
  test.each(['students', 'faculty', 'timetable'])('%s import without csvContent -> 400', async (kind) => {
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

describe('students import', () => {
  test('creates VIEWER accounts with the CSV fields; email is lower-cased; password column is honoured', async () => {
    const e1 = email('stu1');
    const e2 = email('stu2');
    const csv = [
      'name,email,branch,year,section,degree,department_name,roll_no,password',
      `Asha Verma,${e1.toUpperCase()},CSE,2,3,B.Tech,Department Of Computer Science (CSE),2023UCS1001,Init@pass1`,
      `"Ravi, Kumar",${e2},IT,4,1,B.Tech,Department Of Information Technology (IT),2021UIT2002,Init@pass2`,
    ].join('\n');
    const { post, job } = await runImport(app, admin.auth, 'students', csv);
    expect(post.status).toBe(202);
    expect(job).toEqual({ status: 'completed', message: 'Successfully imported 2 student records' });

    const u1 = await userByEmail(e1);
    expect(u1).toMatchObject({
      name: 'Asha Verma', role: 'VIEWER', branch: 'CSE', year: 2, section: 3, degree: 'B.Tech',
      department_name: 'Department Of Computer Science (CSE)', roll_no: '2023UCS1001', is_approved: true,
    });
    expect(u1.password).not.toBe('Init@pass1'); // stored hashed
    expect((await userByEmail(e2)).name).toBe('Ravi, Kumar');

    const ok = await login(e1, 'Init@pass1');
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ email: e1, role: 'VIEWER' });
  });

  test('re-import updates profile fields of existing students but keeps their password', async () => {
    const e = email('upd');
    await runImport(app, admin.auth, 'students', `name,email,branch,year,section,password\nOld Name,${e},ECE,1,1,First@pass\n`);
    const { job } = await runImport(app, admin.auth, 'students', `name,email,branch,year,section,password\nNew Name,${e},EE,3,2,Second@pass\n`);
    expect(job.status).toBe('completed');
    expect(await userByEmail(e)).toMatchObject({ name: 'New Name', branch: 'EE', year: 3, section: 2, role: 'VIEWER' });
    expect((await login(e, 'First@pass')).status).toBe(200);
    expect((await login(e, 'Second@pass')).status).toBe(401);
  });

  test('rows without an email are skipped', async () => {
    const e = email('skip');
    const { job } = await runImport(app, admin.auth, 'students', `name,email\nNo Email,\nHas Email,${e}\n`);
    expect(job.status).toBe('completed');
    expect(await userByEmail(e)).toMatchObject({ name: 'Has Email' });
    expect((await db.query("SELECT 1 FROM users WHERE name = 'No Email'")).rowCount).toBe(0);
  });

  // SEC-04: with no password column the password is `<lowercase name w/o spaces><4 random digits>`.
  // Pin Math.random so the suffix is deterministic (1000) and prove the password is derivable.
  test.failing('[SEC-04] an imported student cannot log in with name + 4 digits (no guessable default password)', async () => {
    const e = email('sec04s');
    const realRandom = Math.random;
    Math.random = () => 0;
    let job;
    try {
      ({ job } = await runImport(app, admin.auth, 'students', `name,email\nPriya Sharma,${e}\n`));
    } finally {
      Math.random = realRandom;
    }
    expect(job.status).toBe('completed');
    const res = await login(e, 'priyasharma1000');
    expect(res.status).toBe(401);
  });

  test.failing('[OPS-08] a duplicate email inside one file does not fail the whole job; the other rows are imported', async () => {
    const dup = email('dup');
    const other = email('dupother');
    const csv = `name,email\nFirst,${dup}\nOther,${other}\nSecond,${dup.toUpperCase()}\n`;
    const { job } = await runImport(app, admin.auth, 'students', csv);
    expect(job.status).toBe('completed');
    expect(await userByEmail(other)).toBeDefined();
    expect(await userByEmail(dup)).toBeDefined();
  });

  test('[OPS-08] (current behaviour) duplicate emails fail the job atomically with a raw Postgres error', async () => {
    const dup = email('dup2');
    const other = email('dup2other');
    const { job } = await runImport(app, admin.auth, 'students', `name,email\nA,${dup}\nB,${other}\nC,${dup}\n`);
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/ON CONFLICT DO UPDATE command cannot affect row a second time/);
    expect(await userByEmail(other)).toBeUndefined();
  });

  test.failing('[OPS-09] a row with an invalid email address is rejected', async () => {
    const good = email('goodmail');
    const bad = `not-an-email-${uniq()}`;
    await runImport(app, admin.auth, 'students', `name,email\nGood,${good}\nBad,${bad}\n`);
    expect(await userByEmail(good)).toBeDefined();
    expect(await userByEmail(bad)).toBeUndefined();
  });

  test.failing.each([
    ['non-numeric year', 'abc', '2'],
    ['out-of-range year', '9', '2'],
    ['out-of-range section', '2', '99'],
  ])('[OPS-09] %s is rejected instead of silently coerced to 1', async (_label, year, section) => {
    const e = email('coerce');
    await runImport(app, admin.auth, 'students', `name,email,year,section\nCoerced,${e},${year},${section}\n`);
    const u = await userByEmail(e);
    // Either the row is rejected, or at least the bad value is not replaced by a plausible default.
    expect(u === undefined || (u.year !== 1 && u.section !== 1)).toBe(true);
  });

  test.failing('[OPS-09] department_id, branch_id and semester are populated for imported students', async () => {
    const dept = (await db.query("SELECT id, name FROM departments WHERE name ILIKE '%Computer Science%' ORDER BY id LIMIT 1")).rows[0];
    expect(dept).toBeDefined();
    const branchName = `CSE-${uniq()}`;
    const branch = (await db.query('INSERT INTO branches (name, short_code, department_id) VALUES ($1, $1, $2) RETURNING id', [branchName, dept.id])).rows[0];
    const e = email('v20');
    await runImport(app, admin.auth, 'students', `name,email,branch,year,section,department_name\nV20 Student,${e},${branchName},2,1,${dept.name}\n`);
    const u = await userByEmail(e);
    expect(u).toMatchObject({ department_id: dept.id, branch_id: branch.id });
    expect(u.semester).not.toBeNull();
  });

  // The ON CONFLICT (email) DO UPDATE has no role filter: a students CSV that happens to contain a
  // staff email rewrites that account's name/branch/year/section (role is left as is).
  test.failing('[NEW-admin-6] a students import does not overwrite an existing FACULTY/ADMIN account', async () => {
    const otherAdmin = await createAdmin({ name: `Real Admin ${uniq()}` });
    const prof = await createFaculty({ name: `Real Prof ${uniq()}` });
    const csv = `name,email,branch,year,section\nImpostor A,${otherAdmin.user.email},CSE,1,1\nImpostor P,${prof.user.email},CSE,1,1\n`;
    await runImport(app, admin.auth, 'students', csv);
    expect(await userByEmail(otherAdmin.user.email)).toMatchObject({ name: otherAdmin.user.name, role: 'ADMIN', branch: null, year: null });
    expect(await userByEmail(prof.user.email)).toMatchObject({ name: prof.user.name, role: 'FACULTY', branch: null, year: null });
  });

  // parseCSV toggles quote state on every `"`, so RFC 4180 escaped quotes ("") vanish.
  test.failing('[NEW-admin-5] escaped double quotes in a quoted field are preserved', async () => {
    const e = email('quote');
    await runImport(app, admin.auth, 'students', `name,email\n"Tom ""TJ"" Jones",${e}\n`);
    expect((await userByEmail(e)).name).toBe('Tom "TJ" Jones');
  });

  // Excel's "CSV UTF-8" output starts with a BOM; header trim() happens to strip it.
  test('a UTF-8 BOM at the start of the file does not drop the first column', async () => {
    const e = email('bom');
    const { job } = await runImport(app, admin.auth, 'students', `﻿name,email\nBom Student,${e}\n`);
    expect(job.status).toBe('completed');
    expect((await userByEmail(e)).name).toBe('Bom Student');
  });

  test('a payload just under the 100kb JSON limit is accepted', async () => {
    const line = `${'x'.repeat(90)},\n`; // name only, no email -> skipped, keeps the job cheap
    const csv = `name,email\n${line.repeat(Math.floor(95_000 / line.length))}`;
    const { post, job } = await runImport(app, admin.auth, 'students', csv);
    expect(post.status).toBe(202);
    expect(job.status).toBe('completed');
  });

  test.failing('[OPS-06] a realistic bulk CSV just over 100kb is accepted (not 413)', async () => {
    const line = `${'x'.repeat(90)},\n`;
    const csv = `name,email\n${line.repeat(Math.ceil(110_000 / line.length))}`;
    expect(Buffer.byteLength(JSON.stringify({ csvContent: csv }))).toBeGreaterThan(100 * 1024);
    const res = await request(app).post('/api/admin/uploads/import/students').set('Authorization', admin.auth).send({ csvContent: csv });
    expect(res.status).toBe(202);
    if (res.status === 202) await pollJob(app, admin.auth, res.body.jobId);
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
    expect((await login(e, 'Fac@pass1')).status).toBe(401);

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

  test('[SEC-04] an imported faculty member cannot log in with their lower-cased name as password', async () => {
    const e = email('sec04f');
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\nAnil Kumar Gupta,${e}\n`);
    expect(job.status).toBe('completed');
    const res = await login(e, 'anilkumargupta');
    expect(res.status).toBe(401);
    expect(await userByEmail(e)).toBeUndefined(); // no password-based account exists at all
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
    await runImport(app, admin.auth, 'students', `name,email,password\nA Student,${e},${TEST_PASSWORD}\n`);
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\nA Professor,${e}\n`);
    expect(job.status).toBe('completed');
    expect(await userByEmail(e)).toMatchObject({ name: 'A Student', role: 'VIEWER' });
    expect(await facultyByEmail(e)).toMatchObject({ name: 'A Professor', is_active: true });
  });
});

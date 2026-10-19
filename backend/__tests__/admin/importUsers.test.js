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
    expect(job).toEqual({ status: 'completed', message: 'Successfully imported 1 faculty records' });
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

describe('faculty import', () => {
  test('creates approved FACULTY accounts; re-import updates name/department only', async () => {
    const e = email('fac');
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email,department_name,password\nDr. Meera Iyer,${e.toUpperCase()},Department Of Electrical Engineering (EE),Fac@pass1\n`);
    expect(job).toEqual({ status: 'completed', message: 'Successfully imported 1 faculty records' });
    expect(await userByEmail(e)).toMatchObject({
      name: 'Dr. Meera Iyer', role: 'FACULTY', department_name: 'Department Of Electrical Engineering (EE)', is_approved: true,
    });
    expect((await login(e, 'Fac@pass1')).status).toBe(200);

    await runImport(app, admin.auth, 'faculty', `name,email,department_name,password\nDr. Meera Iyer-Rao,${e},Department Of Mechanical Engineering (ME),Other@pass\n`);
    expect(await userByEmail(e)).toMatchObject({ name: 'Dr. Meera Iyer-Rao', department_name: 'Department Of Mechanical Engineering (ME)' });
    expect((await login(e, 'Fac@pass1')).status).toBe(200);
  });

  test.failing('[SEC-04] an imported faculty member cannot log in with their lower-cased name as password', async () => {
    const e = email('sec04f');
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\nAnil Kumar Gupta,${e}\n`);
    expect(job.status).toBe('completed');
    const res = await login(e, 'anilkumargupta');
    expect(res.status).toBe(401);
  });

  test.failing('[OPS-09] department_id is populated for imported faculty', async () => {
    const dept = (await db.query("SELECT id, name FROM departments ORDER BY id LIMIT 1")).rows[0];
    const e = email('facdept');
    await runImport(app, admin.auth, 'faculty', `name,email,department_name\nDept Prof,${e},${dept.name}\n`);
    expect((await userByEmail(e)).department_id).toBe(dept.id);
  });

  // Same upsert problem as NEW-admin-6, the other way round: the job reports success but the
  // student account stays a VIEWER (and its name is rewritten).
  test.failing('[NEW-admin-6] a faculty import that hits an existing student email does not silently "succeed"', async () => {
    const e = email('stu2fac');
    await runImport(app, admin.auth, 'students', `name,email,password\nA Student,${e},${TEST_PASSWORD}\n`);
    const { job } = await runImport(app, admin.auth, 'faculty', `name,email\nA Professor,${e}\n`);
    const u = await userByEmail(e);
    // Either the conflict is reported, or the account really is a faculty account afterwards.
    expect(job.status === 'failed' || u.role === 'FACULTY').toBe(true);
  });
});

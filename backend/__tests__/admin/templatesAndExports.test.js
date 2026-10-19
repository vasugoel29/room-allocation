// CSV templates (GET /api/admin/uploads/template/{faculty,timetable}; the students template was removed) and XLSX user exports (GET /api/admin/uploads/export/{students,faculty}).
import request from 'supertest';
import XLSX from 'xlsx-js-style';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createUser, createFaculty, createFacultyEntry, createRep, closeDb } from '../../test/helpers/factories.js';
import { uniq, binaryParser, maxAuditId, auditRowsSince } from './helpers.js';

let admin;
beforeAll(async () => {
  admin = await createAdmin();
});
afterAll(closeDb);

describe('CSV templates', () => {
  test.each([
    ['faculty', 'name,email,department_name,status\n', 'DOWNLOAD_FACULTY_TEMPLATE'],
    ['timetable', 'faculty_name,semester,day_of_week,slot_time,content,is_occupied,room_id\n', 'DOWNLOAD_TIMETABLE_TEMPLATE'],
  ])('%s template: exact header row, CSV attachment, audit entry', async (kind, body, action) => {
    const since = await maxAuditId();
    const res = await request(app).get(`/api/admin/uploads/template/${kind}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toBe(`attachment; filename=${kind}_template.csv`);
    expect(res.text).toBe(body);
    const [row] = await auditRowsSince(since, action);
    expect(row).toMatchObject({ user_id: admin.user.id, entity_type: 'upload', details: { format: 'csv' } });
  });
});

const download = (kind) => request(app)
  .get(`/api/admin/uploads/export/${kind}`)
  .set('Authorization', admin.auth)
  .buffer(true)
  .parse(binaryParser);

const sheetRows = (buf) => {
  const wb = XLSX.read(buf, { type: 'buffer' });
  expect(wb.SheetNames).toEqual(['Data']);
  return XLSX.utils.sheet_to_json(wb.Sheets.Data, { defval: null });
};

describe('XLSX exports', () => {
  test('students export: VIEWER accounts only, profile columns, never the password hash', async () => {
    const student = await createUser({
      name: `Export Student ${uniq()}`, branch: 'CSE', year: 2, section: 3, degree: 'B.Tech',
      department_name: 'Department Of Computer Science (CSE)', roll_no: `R${uniq()}`,
    });
    const prof = await createFaculty();
    const rep = await createRep();
    const since = await maxAuditId();

    const res = await download('students');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename=students_export.xlsx');
    const rows = sheetRows(res.body);
    expect(Object.keys(rows[0])).toEqual(['name', 'email', 'branch', 'year', 'section', 'degree', 'department_name', 'roll_no']);
    expect(rows.find((r) => r.email === student.user.email)).toEqual({
      name: student.user.name, email: student.user.email, branch: 'CSE', year: 2, section: 3, degree: 'B.Tech',
      department_name: 'Department Of Computer Science (CSE)', roll_no: student.user.roll_no,
    });
    const emails = rows.map((r) => r.email);
    expect(emails).not.toContain(prof.user.email);
    expect(emails).not.toContain(admin.user.email);
    // QUESTION: class representatives (STUDENT_REP) are students too but are left out of the export.
    expect(emails).not.toContain(rep.user.email);
    expect(res.body.toString('latin1')).not.toContain('$2b$');

    const [audit] = await auditRowsSince(since, 'EXPORT_STUDENTS_XLSX');
    expect(audit).toMatchObject({ user_id: admin.user.id, details: { format: 'xlsx' } });
  });

  test('faculty export: faculty-directory entries with name/email/department/status (inactive ones included)', async () => {
    const prof = await createFaculty({ name: `Export Prof ${uniq()}` });
    await db.query('UPDATE faculties SET department_name = $1 WHERE id = $2', ['Department Of Electrical Engineering (EE)', prof.faculty.id]);
    const dirOnly = await createFacultyEntry({ name: `Export Dir ${uniq()}`, department_name: 'Department Of Mechanical Engineering (ME)' });
    const gone = await createFacultyEntry({ name: `Export Gone ${uniq()}`, is_active: false });
    const student = await createUser();
    const res = await download('faculty');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename=faculty_export.xlsx');
    const rows = sheetRows(res.body);
    expect(rows.find((r) => r.email === prof.faculty.email)).toEqual({
      name: prof.faculty.name, email: prof.faculty.email, department_name: 'Department Of Electrical Engineering (EE)', status: 'active',
    });
    expect(rows.find((r) => r.email === dirOnly.email)).toEqual({
      name: dirOnly.name, email: dirOnly.email, department_name: 'Department Of Mechanical Engineering (ME)', status: 'active',
    });
    expect(rows.find((r) => r.email === gone.email)).toMatchObject({ name: gone.name, status: 'inactive' });
    expect(rows.map((r) => r.email)).not.toContain(student.user.email);
  });

  test('a spreadsheet formula in a name is exported as a plain string cell, not a formula', async () => {
    const evil = await createUser({ name: `=HYPERLINK("http://evil","x")${uniq()}` });
    const res = await download('students');
    const wb = XLSX.read(res.body, { type: 'buffer', cellFormula: true });
    const ws = wb.Sheets.Data;
    const cell = Object.keys(ws).filter((k) => !k.startsWith('!')).map((k) => ws[k]).find((c) => c.v === evil.user.name);
    expect(cell).toBeDefined();
    expect(cell.t).toBe('s');
    expect(cell.f).toBeUndefined();
  });
});

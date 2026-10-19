// GET /api/admin/export/bookings (CSV). (The promotions export was removed with the promotion feature.)
// Each test works in its own far-future date window so the date filters isolate its rows.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import { createAdmin, createUser, createRoom, insertBooking, closeDb } from '../../test/helpers/factories.js';
import { uniq } from './helpers.js';

/** Minimal RFC 4180 parser (quoted fields, "" escapes, embedded commas/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const HEADER = ['ID', 'Room', 'Start Time', 'End Time', 'User', 'Purpose', 'Status'];

let admin;
let booker;
let room;

beforeAll(async () => {
  admin = await createAdmin();
  booker = await createUser({ role: 'STUDENT_REP', name: `Export Booker ${uniq()}` });
  room = await createRoom();
});
afterAll(closeDb);

const exportCsv = (query = {}) =>
  request(app).get('/api/admin/export/bookings').query(query).set('Authorization', admin.auth);

/** A booking in an isolated window: `day` is an ISO date (YYYY-MM-DD) far in the future. */
const bookingOn = (day, hourUtc, extra = {}) =>
  insertBooking({
    room_id: room.id,
    created_by: booker.user.id,
    start_time: `${day}T${String(hourUtc).padStart(2, '0')}:00:00.000Z`,
    end_time: `${day}T${String(hourUtc + 1).padStart(2, '0')}:00:00.000Z`,
    ...extra,
  });

const windowFor = (day) => ({ start_date: `${day}T00:00:00Z`, end_date: `${day}T23:59:59Z` });

describe('GET /api/admin/export/bookings', () => {
  test('sets CSV content-type and an attachment filename', async () => {
    const res = await exportCsv(windowFor('2031-01-05'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename=bookings_export_.*\.csv$/);
  });

  test('an empty window yields only the header row', async () => {
    const res = await exportCsv(windowFor('2031-01-06'));
    expect(res.status).toBe(200);
    expect(res.text).toBe(`${HEADER.join(',')}\n`);
  });

  test('exports every booking in the window (all statuses), newest first, with room, user, purpose and status', async () => {
    const day = '2031-01-07';
    const b1 = await bookingOn(day, 3, { purpose: 'Morning lab' });
    const b2 = await bookingOn(day, 5, { purpose: 'Seminar', status: 'CANCELLED' });
    const b3 = await bookingOn(day, 7, { purpose: 'Pending talk', status: 'PENDING' });

    const res = await exportCsv(windowFor(day));
    expect(res.status).toBe(200);
    const rows = parseCsv(res.text);
    expect(rows[0]).toEqual(HEADER);
    const body = rows.slice(1);
    expect(body.map((r) => Number(r[0]))).toEqual([b3.id, b2.id, b1.id]);
    expect(body[2]).toEqual([
      String(b1.id), room.name, expect.any(String), expect.any(String), booker.user.name, 'Morning lab', 'ACTIVE',
    ]);
    expect(body[1][6]).toBe('CANCELLED');
    expect(body[0][6]).toBe('PENDING');
    // Start/end columns must still denote the stored instants.
    expect(new Date(body[2][2]).toISOString()).toBe(new Date(b1.start_time).toISOString());
    expect(new Date(body[2][3]).toISOString()).toBe(new Date(b1.end_time).toISOString());
  });

  test('start_date is inclusive on start_time; end_date is inclusive on end_time', async () => {
    const day = '2031-01-08';
    const early = await bookingOn(day, 2); // 02:00-03:00Z
    const mid = await bookingOn(day, 6); // 06:00-07:00Z
    const late = await bookingOn(day, 10); // 10:00-11:00Z

    const ids = async (q) => parseCsv((await exportCsv(q)).text).slice(1).map((r) => Number(r[0]));

    expect(await ids({ start_date: `${day}T06:00:00Z`, end_date: `${day}T23:00:00Z` })).toEqual([late.id, mid.id]);
    expect(await ids({ start_date: `${day}T00:00:00Z`, end_date: `${day}T07:00:00Z` })).toEqual([mid.id, early.id]);
    // A booking that starts inside the window but ends after end_date is excluded.
    expect(await ids({ start_date: `${day}T00:00:00Z`, end_date: `${day}T06:30:00Z` })).toEqual([early.id]);
    // Only start_date given: everything from there on (incl. other windows), so just check membership.
    const open = await ids({ start_date: `${day}T09:00:00Z` });
    expect(open).toContain(late.id);
    expect(open).not.toContain(mid.id);
  });

  // QUESTION: a date-only end_date ("2031-01-09") means midnight UTC, so bookings later that day
  // are excluded. Admins picking a calendar day probably expect the whole (IST) day.
  test('date-only end_date is treated as midnight UTC (excludes bookings later that day)', async () => {
    const day = '2031-01-09';
    const b = await bookingOn(day, 4);
    const res = await exportCsv({ start_date: day, end_date: day });
    expect(parseCsv(res.text).slice(1).map((r) => Number(r[0]))).not.toContain(b.id);
  });

  test('double quotes, commas and newlines in purpose/user name are quoted and round-trip', async () => {
    const day = '2031-01-10';
    const user = await createUser({ name: `Smith, "JJ" ${uniq()}` });
    const purpose = 'Talk: "AI, ethics"\nsecond line';
    const b = await insertBooking({
      room_id: room.id, created_by: user.user.id, purpose,
      start_time: `${day}T04:00:00Z`, end_time: `${day}T05:00:00Z`,
    });
    const rows = parseCsv((await exportCsv(windowFor(day))).text);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(7);
    expect(Number(rows[1][0])).toBe(b.id);
    expect(rows[1][4]).toBe(user.user.name);
    expect(rows[1][5]).toBe(purpose);
  });

  test.each(['=', '+', '-', '@'])('formula prefix %s in purpose and user name is neutralised with a leading quote', async (ch) => {
    const day = `2031-02-${String(10 + ['=', '+', '-', '@'].indexOf(ch)).padStart(2, '0')}`;
    const user = await createUser({ name: `${ch}HYPERLINK("http://evil")${uniq()}` });
    await insertBooking({
      room_id: room.id, created_by: user.user.id, purpose: `${ch}cmd|' /C calc'!A0`,
      start_time: `${day}T04:00:00Z`, end_time: `${day}T05:00:00Z`,
    });
    const rows = parseCsv((await exportCsv(windowFor(day))).text);
    expect(rows[1][4]).toBe(`'${user.user.name}`);
    expect(rows[1][5]).toBe(`'${ch}cmd|' /C calc'!A0`);
  });

  test('formula prefix in the room name is neutralised', async () => {
    const day = '2031-02-20';
    const evilRoom = await createRoom({ name: `=1+1${uniq()}`.slice(0, 32) });
    await insertBooking({ room_id: evilRoom.id, created_by: booker.user.id, start_time: `${day}T04:00:00Z`, end_time: `${day}T05:00:00Z` });
    const rows = parseCsv((await exportCsv(windowFor(day))).text);
    expect(rows[1][1]).toBe(`'${evilRoom.name}`);
  });

  test.each([
    ['tab', '\t=cmd|calc'],
    ['carriage return', '\r=cmd|calc'],
  ])('[SEC-22] a leading %s before a formula is also neutralised', async (_label, purpose) => {
    const day = purpose.startsWith('\t') ? '2031-02-21' : '2031-02-22';
    await insertBooking({ room_id: room.id, created_by: booker.user.id, purpose, start_time: `${day}T04:00:00Z`, end_time: `${day}T05:00:00Z` });
    const res = await exportCsv(windowFor(day));
    const line = res.text.split('\n')[1];
    // The purpose field must start with the neutralising apostrophe (inside the quotes).
    expect(line).toContain(`"'${purpose.replace(/"/g, '""')}"`);
  });

  test('[SEC-22] a room name containing a comma is quoted, so the row keeps 7 columns', async () => {
    const day = '2031-02-23';
    const commaRoom = await createRoom({ name: `Lab A, Wing ${uniq()}`.slice(0, 32) });
    await insertBooking({ room_id: commaRoom.id, created_by: booker.user.id, start_time: `${day}T04:00:00Z`, end_time: `${day}T05:00:00Z` });
    const rows = parseCsv((await exportCsv(windowFor(day))).text);
    expect(rows[1]).toHaveLength(7);
    expect(rows[1][1]).toBe(commaRoom.name);
  });

  // Start/End are written via Date#toString ("Mon Feb 24 2031 09:30:00 GMT+0530 (India Standard
  // Time)"): depends on the server's TZ, verbose, and not reliably parsed by spreadsheets.
  test('[NEW-admin-2] start/end times are exported as ISO-8601 timestamps', async () => {
    const day = '2031-02-24';
    const b = await bookingOn(day, 4);
    const rows = parseCsv((await exportCsv(windowFor(day))).text);
    expect(rows[1][2]).toBe(new Date(b.start_time).toISOString());
    expect(rows[1][3]).toBe(new Date(b.end_time).toISOString());
  });
});

// Shared helpers for the bookings-area tests (backend/__tests__/bookings/).
import * as db from '../../src/db.js';
import { istDateTimeToUtc, getIstParts } from '../../src/utils/timezone.js';

let seq = 0;
export const uniq = (p = 'x') => `${p}${process.pid}${Date.now().toString(36)}${(seq++).toString(36)}`;

const HOUR = 3600_000;
const isWeekend = (iso) => ['Sat', 'Sun'].includes(getIstParts(iso).day);

/** ISO end time `hours` after `start`. */
export const plusHours = (start, hours = 1) => new Date(new Date(start).getTime() + hours * HOUR).toISOString();

/** IST wall-clock -> ISO UTC. */
export const ist = (dateKey, hour, minute = 0) => istDateTimeToUtc(dateKey, hour, minute);

/** A weekday (IST) slot at `hour` IST, `minDaysAgo`+ days in the past. */
export function pastWeekdaySlot(hour = 10, minDaysAgo = 1) {
  for (let i = minDaysAgo; i < minDaysAgo + 10; i++) {
    const dateKey = getIstParts(Date.now() - i * 86400_000).date;
    const start = ist(dateKey, hour);
    if (!isWeekend(start)) return { start, end: plusHours(start), dateKey };
  }
  throw new Error('no past weekday');
}

/** A weekday (IST) slot more than 7 days out (outside the student booking window). */
export function farWeekdaySlot(hour = 10, minDays = 9) {
  for (let i = minDays; i < minDays + 10; i++) {
    const dateKey = getIstParts(Date.now() + i * 86400_000).date;
    const start = ist(dateKey, hour);
    if (!isWeekend(start)) return { start, end: plusHours(start), dateKey, day: getIstParts(start).day };
  }
  throw new Error('no far weekday');
}

export const getBooking = async (id) => (await db.query('SELECT * FROM bookings WHERE id = $1', [id])).rows[0];

export const auditRows = async (entityId, action) =>
  (await db.query(
    `SELECT * FROM audit_logs WHERE entity_type = 'booking' AND entity_id = $1 ${action ? 'AND action = $2' : ''} ORDER BY id`,
    action ? [entityId, action] : [entityId],
  )).rows;

export const historyRows = async (bookingId) =>
  (await db.query('SELECT * FROM booking_history WHERE booking_id = $1 ORDER BY id', [bookingId])).rows;

/** Inserts a timetable_slots row (all text columns) and returns it. */
export async function insertTimetableSlot(fields) {
  const cols = Object.keys(fields);
  const { rows } = await db.query(
    `INSERT INTO timetable_slots (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    cols.map((c) => (fields[c] == null ? null : String(fields[c]))),
  );
  return rows[0];
}

/** Inserts a room_slot_releases row (a timetabled class in `room_id` that does not happen on `release_date`). */
export async function insertRelease({ room_id, release_date, start_hour, end_hour = start_hour + 1, is_active = true, source_type = 'test', source_id = null }) {
  const { rows } = await db.query(
    `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type, source_id, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [room_id, release_date, start_hour, end_hour, source_type, source_id, is_active],
  );
  return rows[0];
}

export const releasesFor = async (sourceType, sourceId) =>
  (await db.query('SELECT * FROM room_slot_releases WHERE source_type = $1 AND source_id = $2 ORDER BY id', [sourceType, sourceId])).rows;

/** Polls `fn` until it returns a truthy value (for async side effects such as the audit middleware). */
export async function waitFor(fn, { timeout = 3000, interval = 50 } = {}) {
  const until = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, interval));
  }
}

import * as db from '../db.js';

/**
 * Reads of the CRAS-owned timetables. Classes are matched by id (room_id, faculty_id) and by the
 * ACL section key (branch + semester + section); only active rows count. `day` is 'Mon'…'Sun' or
 * null for the whole week. Every class row carries start_min/end_min (minutes since IST midnight).
 *
 * Two sources: section timetables (timetable_slots, the admin import) and faculty timetable slots
 * (faculty_timetable_slots, the faculty CSV import / admin edits; only is_occupied ones block).
 */

const SECTION_CLASSES = `
  SELECT 'section' AS kind, t.id, t.day_of_week, t.start_min, t.end_min, t.slot_time, t.subject_name,
         t.faculty_name, t.room_name, t.department, t.semester::text AS semester, t.section::text AS section,
         t.room_id, t.faculty_id, t.subject_code, t.batch
    FROM timetable_slots t WHERE t.is_active`;

const FACULTY_CLASSES = `
  SELECT 'faculty' AS kind, f.id, f.day_of_week, f.start_min, f.end_min, f.slot_time, f.content,
         f.faculty_name, r.name, NULL, f.semester, NULL, f.room_id, f.faculty_id, NULL, NULL
    FROM faculty_timetable_slots f LEFT JOIN rooms r ON r.id = f.room_id
   WHERE f.is_active AND f.is_occupied`;

const dayFilter = (alias, n) => `($${n}::text IS NULL OR ${alias}.day_of_week = $${n})`;

/** The ACL section key as stored: branch upper-cased, integer semester and section. */
export function sectionKey({ branch, semester, section }) {
  const b = String(branch || '').trim().toUpperCase();
  const sem = Number(semester);
  const sec = Number(section);
  if (!b || !Number.isInteger(sem) || !Number.isInteger(sec)) return null;
  return { department: b, semester: sem, section: sec };
}

export const timetableRepository = {
  /** Classes held in a room (section classes and occupied faculty slots). */
  roomClasses: async (roomId, day = null, client = db) => (await client.query(
    `${SECTION_CLASSES} AND t.room_id = $1 AND ${dayFilter('t', 2)}
     UNION ALL
     ${FACULTY_CLASSES} AND f.room_id = $1 AND ${dayFilter('f', 2)}
     ORDER BY day_of_week, start_min`,
    [roomId, day],
  )).rows,

  /** Classes a faculty-directory entry teaches. */
  facultyClasses: async (facultyId, day = null, client = db) => (await client.query(
    `${SECTION_CLASSES} AND t.faculty_id = $1 AND ${dayFilter('t', 2)}
     UNION ALL
     ${FACULTY_CLASSES} AND f.faculty_id = $1 AND ${dayFilter('f', 2)}
     ORDER BY day_of_week, start_min`,
    [facultyId, day],
  )).rows,

  /** A section's classes; `key` from sectionKey(). */
  sectionClasses: async (key, day = null, client = db) => (key ? (await client.query(
    `${SECTION_CLASSES} AND t.department = $1 AND t.semester = $2 AND t.section = $3 AND ${dayFilter('t', 4)}
     ORDER BY t.day_of_week, t.start_min`,
    [key.department, key.semester, key.section, day],
  )).rows : []),

  /** Hours (IST) on dateKey for which this faculty member cancelled their own class. */
  cancelledHours: async (facultyId, dateKey, client = db) => new Set((await client.query(
    'SELECT hour FROM faculty_slot_overrides WHERE faculty_id = $1 AND date = $2::date AND is_cancelled',
    [facultyId, dateKey],
  )).rows.map((r) => r.hour)),

  /** Admin weekly blocks: the blocked hours of a room on a weekday. */
  blockedHours: async (roomId, day, client = db) => (await client.query(
    'SELECT hour FROM room_availability WHERE room_id = $1 AND day = $2 AND is_active ORDER BY hour',
    [roomId, day],
  )).rows.map((r) => r.hour),

  /** Is every hour of [startHour, endHour) of this room released on dateKey (class cancelled/moved)? */
  isReleased: async (roomId, dateKey, startHour, endHour, client = db) => (await client.query(
    `SELECT 1 FROM room_slot_releases
      WHERE room_id = $1 AND release_date = $2 AND is_active AND start_hour <= $3 AND end_hour >= $4 LIMIT 1`,
    [roomId, dateKey, startHour, endHour],
  )).rowCount > 0,

  /**
   * Every room-hour taken by a class in the weekly timetable, for the calendar feed:
   * { room_id, room_name, day, hour }. An hour is taken when any part of it overlaps a class.
   */
  weeklyClassHours: async (client = db) => (await client.query(
    `SELECT DISTINCT c.room_id, r.name AS room_name, c.day_of_week AS day, h AS hour
       FROM (${SECTION_CLASSES} AND t.room_id IS NOT NULL UNION ALL ${FACULTY_CLASSES} AND f.room_id IS NOT NULL) c
       JOIN rooms r ON r.id = c.room_id AND r.is_active
      CROSS JOIN LATERAL generate_series(c.start_min / 60, (c.end_min - 1) / 60) AS h
      ORDER BY 1, 3, 4`,
  )).rows,
};

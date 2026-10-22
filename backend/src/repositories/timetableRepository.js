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

const SLOT_RETURNING = 'id, faculty_name, faculty_id, semester, day_of_week, slot_time, start_min, end_min, content, is_occupied, room_id, created_at';

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

  /** Branches (ACL values) with an active section timetable. */
  branches: async (client = db) => (await client.query(
    'SELECT DISTINCT department FROM timetable_slots WHERE is_active ORDER BY department',
  )).rows.map((r) => r.department),

  /** Section classes filed under a teacher's name, or linked to a directory entry of that name. */
  classesForFacultyName: async (upperName, client = db) => (await client.query(
    `SELECT * FROM timetable_slots
      WHERE is_active AND (UPPER(TRIM(faculty_name)) = $1 OR faculty_id IN (SELECT id FROM faculties WHERE UPPER(TRIM(name)) = $1))
      ORDER BY day_of_week, start_min`,
    [upperName],
  )).rows,

  /** Names matching `term` in the faculty directory and the section timetables, one per name (any case). */
  facultyNamesLike: async (term, limit = 10, client = db) => (await client.query(
    `SELECT MAX(name) AS name FROM (
       SELECT name FROM faculties WHERE is_active AND name ILIKE $1
       UNION
       SELECT DISTINCT faculty_name FROM timetable_slots WHERE is_active AND faculty_name ILIKE $1
     ) AS combined
     WHERE name IS NOT NULL AND name <> ''
     GROUP BY UPPER(name) ORDER BY name LIMIT $2`,
    [`%${term}%`, limit],
  )).rows.map((r) => r.name),

  // ── Faculty timetable slots (admin-managed) ──────────────────────────────────────────────
  /** A faculty member's own slots, with the room name. */
  facultySlotsOf: async (facultyId, day = null, client = db) => (await client.query(
    `SELECT fts.*, r.name AS room_name
       FROM faculty_timetable_slots fts LEFT JOIN rooms r ON r.id = fts.room_id
      WHERE fts.faculty_id = $1 AND fts.is_active AND ${dayFilter('fts', 2)}
      ORDER BY fts.day_of_week, fts.start_min`,
    [facultyId, day],
  )).rows,

  /** Paged admin list of active slots; filters: faculty_name (ILIKE), day_of_week (ILIKE), semester. */
  listFacultySlots: async ({ faculty_name, day_of_week, semester, limit, offset }, client = db) => {
    const conditions = ['fts.is_active'];
    const values = [];
    if (faculty_name) { values.push(`%${faculty_name}%`); conditions.push(`fts.faculty_name ILIKE $${values.length}`); }
    if (day_of_week) { values.push(day_of_week); conditions.push(`fts.day_of_week ILIKE $${values.length}`); }
    if (semester) { values.push(semester); conditions.push(`fts.semester = $${values.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [data, count] = await Promise.all([
      client.query(
        `SELECT fts.id, fts.faculty_name, fts.faculty_id, fts.semester, fts.day_of_week, fts.slot_time, fts.start_min, fts.end_min,
                fts.content, fts.is_occupied, fts.room_id, r.name AS room_name, fts.created_at
           FROM faculty_timetable_slots fts LEFT JOIN rooms r ON r.id = fts.room_id
           ${where}
          ORDER BY fts.faculty_name, fts.day_of_week, fts.start_min
          LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      ),
      client.query(`SELECT COUNT(*) FROM faculty_timetable_slots fts ${where}`, values),
    ]);
    return { rows: data.rows, total: Number(count.rows[0].count) };
  },

  createFacultySlot: async (f, client = db) => (await client.query(
    `INSERT INTO faculty_timetable_slots (faculty_name, faculty_id, semester, day_of_week, slot_time, start_min, end_min, content, is_occupied, room_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${SLOT_RETURNING}`,
    [f.faculty_name, f.faculty_id, f.semester ?? '', f.day_of_week, f.slot_time, f.start_min, f.end_min, f.content ?? '', f.is_occupied ?? false, f.room_id ?? null],
  )).rows[0],

  /** Partial update: absent fields keep their value; room_id changes only when `setRoom` (null unassigns, OPS-12). */
  updateFacultySlot: async (id, f, { setRoom = false } = {}, client = db) => (await client.query(
    `UPDATE faculty_timetable_slots
        SET faculty_name = COALESCE($1, faculty_name), faculty_id = COALESCE($2, faculty_id), semester = COALESCE($3, semester),
            day_of_week = COALESCE($4, day_of_week), slot_time = COALESCE($5, slot_time), start_min = COALESCE($6, start_min),
            end_min = COALESCE($7, end_min), content = COALESCE($8, content), is_occupied = COALESCE($9, is_occupied),
            room_id = CASE WHEN $12::boolean THEN $10 ELSE room_id END
      WHERE id = $11 AND is_active
      RETURNING ${SLOT_RETURNING}`,
    [f.faculty_name, f.faculty_id, f.semester, f.day_of_week, f.slot_time, f.start_min, f.end_min, f.content, f.is_occupied,
      f.room_id ?? null, id, setRoom],
  )).rows[0],

  facultySlotById: async (id, client = db) => (await client.query(
    'SELECT * FROM faculty_timetable_slots WHERE id = $1 AND is_active', [id],
  )).rows[0] || null,

  /** Soft delete. */
  deactivateFacultySlot: async (id, client = db) => (await client.query(
    'UPDATE faculty_timetable_slots SET is_active = FALSE, deactivated_at = NOW() WHERE id = $1 AND is_active RETURNING id', [id],
  )).rowCount > 0,

  // ── A faculty member cancelling one of their own classes for a date ──────────────────────
  upsertOverride: async ({ facultyId, date, hour, cancelled, by }, client = db) => (await client.query(
    `INSERT INTO faculty_slot_overrides (faculty_id, date, hour, is_cancelled, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (faculty_id, date, hour) DO UPDATE SET is_cancelled = EXCLUDED.is_cancelled, created_by = EXCLUDED.created_by
     RETURNING id, faculty_id, date::text AS date, hour, is_cancelled`,
    [facultyId, date, hour, cancelled, by],
  )).rows[0],

  /** Cancelled classes from 30 days ago on. */
  cancelledClasses: async (facultyId, client = db) => (await client.query(
    `SELECT id, faculty_id, date::text AS date, hour, is_cancelled FROM faculty_slot_overrides
      WHERE faculty_id = $1 AND date >= CURRENT_DATE - 30 AND is_cancelled ORDER BY date, hour`,
    [facultyId],
  )).rows,

  // ── Dated releases (a class not held on one date) ────────────────────────────────────────
  release: async ({ roomId, date, startHour, endHour, sourceType, sourceId, by }, client = db) => client.query(
    `INSERT INTO room_slot_releases (room_id, release_date, start_hour, end_hour, source_type, source_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [roomId, date, startHour, endHour, sourceType, sourceId, by],
  ),

  withdrawReleases: async (sourceType, sourceIds, client = db) => client.query(
    `UPDATE room_slot_releases SET is_active = FALSE, deactivated_at = NOW()
      WHERE source_type = $1 AND source_id = ANY($2) AND is_active`,
    [sourceType, [].concat(sourceIds)],
  ),

  // ── Class-cancellation requests (a student asks the teacher to cancel a class for a date) ─
  createCancellationRequest: async (r, client = db) => (await client.query(
    `INSERT INTO class_cancellation_requests (requested_by, faculty_id, room_id, subject_name, class_date, hour, booking_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [r.requestedBy, r.facultyId, r.roomId, r.subjectName ?? null, r.date, r.hour, r.bookingId ?? null],
  )).rows[0],

  pendingCancellationRequests: async (facultyId, client = db) => (await client.query(
    `SELECT c.*, COALESCE(r.name, c.room_name) AS room_name, u.name AS user_name
       FROM class_cancellation_requests c
       JOIN users u ON u.id = c.requested_by
       LEFT JOIN rooms r ON r.id = c.room_id
      WHERE c.faculty_id = $1 AND c.status = 'PENDING'
      ORDER BY c.created_at DESC`,
    [facultyId],
  )).rows,

  /** A pending request addressed to this faculty member, locked for review. */
  lockPendingCancellationRequest: async (id, facultyId, client) => (await client.query(
    `SELECT c.*, COALESCE(r.name, c.room_name) AS room_name, r.is_active AS room_active
       FROM class_cancellation_requests c LEFT JOIN rooms r ON r.id = c.room_id
      WHERE c.id = $1 AND c.faculty_id = $2 AND c.status = 'PENDING'
      FOR UPDATE OF c`,
    [id, facultyId],
  )).rows[0],

  decideCancellationRequest: async (id, status, by, client) => client.query(
    'UPDATE class_cancellation_requests SET status = $2, reviewed_at = NOW(), reviewed_by = $3 WHERE id = $1',
    [id, status, by],
  ),
};


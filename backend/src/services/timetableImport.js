import { normalizeDay, parseSlotTime } from '../utils/timetableLogic.js';

/**
 * Section-timetable import, shared by the admin upload (POST /api/timetable/upload) and the
 * seeder's demo timetable. Runs inside the caller's transaction.
 *
 * - Each row is validated: branch (`department`), integer semester and section, a weekday and a
 *   readable "HH:MM-HH:MM" time. Bad rows are rejected and reported, never stored.
 * - Room and faculty names are resolved to ids, case-insensitively. Names CRAS doesn't know are
 *   kept as labels and reported back (`unresolved`), so they can be fixed in the source or added.
 * - An import is the timetable of the sections it contains: their active classes not in the
 *   import are soft-deleted, identical ones are left as they are, new ones are added. Running the
 *   same import twice changes nothing.
 */
export const SLOT_COLUMNS = ['department', 'semester', 'section', 'day_of_week', 'slot_time', 'subject_name', 'room_name',
  'subject_code', 'faculty_name', 'batch'];

const text = (v) => {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || null;
};
const int = (v, min, max) => {
  const n = Number(String(v ?? '').trim());
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** The identity of a class, as the unique index timetable_slots_active_key sees it. */
const classKey = (r) => JSON.stringify([
  r.department, r.semester, r.section, r.day_of_week, r.start_min, r.end_min, r.batch || '', r.subject_code || '',
  r.subject_name || '', (r.room_name || '').toLowerCase(), (r.faculty_name || '').toUpperCase(),
]);

function normalise(slot) {
  const department = text(slot?.department ?? slot?.branch)?.toUpperCase() ?? null;
  const semester = int(slot?.semester, 1, 12);
  const section = int(slot?.section, 1, 30);
  const day = normalizeDay(slot?.day_of_week);
  const slotTime = text(slot?.slot_time);
  const time = parseSlotTime(slotTime);
  const missing = [!department && 'department', semester == null && 'semester', section == null && 'section',
    !day && 'day_of_week', !time && 'slot_time'].filter(Boolean);
  if (missing.length) return { reason: `invalid or missing ${missing.join(', ')}` };
  return {
    row: {
      department, semester, section, day_of_week: day, slot_time: slotTime, start_min: time.startMin, end_min: time.endMin,
      subject_code: text(slot.subject_code), subject_name: text(slot.subject_name), room_name: text(slot.room_name),
      faculty_name: text(slot.faculty_name), batch: text(slot.batch),
    },
  };
}

async function resolveNames(client, rows) {
  const roomNames = [...new Set(rows.map((r) => r.room_name?.toLowerCase()).filter(Boolean))];
  const facultyNames = [...new Set(rows.map((r) => r.faculty_name?.toUpperCase()).filter(Boolean))];
  const rooms = new Map((await client.query(
    `SELECT DISTINCT ON (lower(trim(name))) lower(trim(name)) AS k, id FROM rooms
      WHERE lower(trim(name)) = ANY($1) ORDER BY lower(trim(name)), is_active DESC, id`, [roomNames],
  )).rows.map((r) => [r.k, r.id]));
  const faculty = new Map((await client.query(
    `SELECT DISTINCT ON (upper(trim(name))) upper(trim(name)) AS k, id FROM faculties
      WHERE upper(trim(name)) = ANY($1) ORDER BY upper(trim(name)), is_active DESC, id`, [facultyNames],
  )).rows.map((r) => [r.k, r.id]));
  for (const r of rows) {
    r.room_id = r.room_name ? rooms.get(r.room_name.toLowerCase()) ?? null : null;
    r.faculty_id = r.faculty_name ? faculty.get(r.faculty_name.toUpperCase()) ?? null : null;
  }
  const unresolved = (key, map) => [...new Set(rows.filter((r) => r[key] && !map.has(
    key === 'room_name' ? r[key].toLowerCase() : r[key].toUpperCase())).map((r) => r[key]))].sort();
  return { rooms: unresolved('room_name', rooms), faculty: unresolved('faculty_name', faculty) };
}

const INSERT_COLUMNS = ['department', 'semester', 'section', 'day_of_week', 'slot_time', 'start_min', 'end_min', 'subject_code',
  'subject_name', 'room_name', 'faculty_name', 'batch', 'room_id', 'faculty_id'];

export async function importSectionSlots(client, slots) {
  const rejected = [];
  const incoming = new Map();
  slots.forEach((slot, index) => {
    const { row, reason } = normalise(slot);
    if (reason) rejected.push({ index, reason });
    else if (!incoming.has(classKey(row))) incoming.set(classKey(row), row);
  });
  const rows = [...incoming.values()];
  const unresolved = await resolveNames(client, rows);

  const sections = [...new Map(rows.map((r) => [`${r.department}|${r.semester}|${r.section}`, r])).values()];
  const { rows: existing } = sections.length ? await client.query(
    `SELECT t.* FROM timetable_slots t
       JOIN unnest($1::text[], $2::int[], $3::int[]) AS s(department, semester, section)
         ON t.department = s.department AND t.semester = s.semester AND t.section = s.section
      WHERE t.is_active`,
    [sections.map((s) => s.department), sections.map((s) => s.semester), sections.map((s) => s.section)],
  ) : { rows: [] };

  const existingByKey = new Map(existing.map((e) => [classKey(e), e]));
  const gone = existing.filter((e) => !incoming.has(classKey(e))).map((e) => e.id);
  const added = rows.filter((r) => !existingByKey.has(classKey(r)));
  // A kept class picks up a room or faculty member added to CRAS since the last import.
  const relinked = rows.filter((r) => {
    const e = existingByKey.get(classKey(r));
    return e && (e.room_id !== r.room_id || e.faculty_id !== r.faculty_id);
  }).map((r) => ({ id: existingByKey.get(classKey(r)).id, room_id: r.room_id, faculty_id: r.faculty_id }));

  if (gone.length) {
    await client.query('UPDATE timetable_slots SET is_active = FALSE, deactivated_at = NOW() WHERE id = ANY($1)', [gone]);
  }
  if (relinked.length) {
    await client.query(
      `UPDATE timetable_slots t SET room_id = v.room_id, faculty_id = v.faculty_id
         FROM unnest($1::int[], $2::int[], $3::int[]) AS v(id, room_id, faculty_id) WHERE t.id = v.id`,
      [relinked.map((r) => r.id), relinked.map((r) => r.room_id), relinked.map((r) => r.faculty_id)],
    );
  }
  for (let i = 0; i < added.length; i += 200) {
    const chunk = added.slice(i, i + 200);
    const placeholders = chunk.map((_, r) => `(${INSERT_COLUMNS.map((__, c) => `$${r * INSERT_COLUMNS.length + c + 1}`).join(', ')})`);
    await client.query(
      `INSERT INTO timetable_slots (${INSERT_COLUMNS.join(', ')}) VALUES ${placeholders.join(', ')}`,
      chunk.flatMap((r) => INSERT_COLUMNS.map((c) => r[c])),
    );
  }

  return {
    sections: sections.length,
    inserted: added.length,
    unchanged: rows.length - added.length,
    deactivated: gone.length,
    rejected,
    unresolved,
  };
}

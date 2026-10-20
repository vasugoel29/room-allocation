import { getIstParts, istDateTimeToUtc } from '../utils/timezone.js';
import { facultyRepository } from '../repositories/facultyRepository.js';

/**
 * The single set of booking rules, shared by create, reschedule, admin quick-book and faculty
 * approval. Every check returns `{ error, status, conflict? }` or null.
 *
 * Product rules (see FINDINGS / decisions):
 *  - Students' bookings always need a supervising faculty member (PENDING until approved).
 *  - A person has at most one commitment per time slot: timetable classes and bookings alike,
 *    PENDING requests included, for the requester and for the supervising faculty.
 *  - A room is unavailable during its own timetabled classes unless that class is released for
 *    the date (approved class cancellation or reschedule).
 * The database enforces the overlap rules too (migration v26), so concurrent requests can't
 * slip past these checks.
 */

export const RULES = Object.freeze({
  OPEN_HOUR: 8, // earliest start, IST
  CLOSE_HOUR: 20, // latest end, IST
  MAX_HOURS: 4,
  WINDOW_DAYS: 7, // how far ahead non-admins may book
});

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


const bad = (error, status = 400, extra = {}) => ({ error, status, ...extra });

/**
 * Minutes since IST midnight for a timetable time. An explicit AM/PM is honoured ("07:30 AM",
 * "2:00 pm"); bare times follow the source data's 12-hour convention, where 01:00–07:59 means PM.
 */
export function timetableMinutes(hhmm) {
  const m = String(hhmm || '').trim().match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const meridiem = m[3]?.[0]?.toLowerCase();
  if (meridiem === 'a') h = h % 12;
  else if (meridiem === 'p') h = (h % 12) + 12;
  else if (h >= 1 && h < 8) h += 12;
  return h * 60 + Number(m[2]);
}

/** Does a timetable slot "HH:MM-HH:MM" overlap [startMin, endMin)? */
export function slotOverlaps(slotTime, startMin, endMin) {
  const [a, b] = String(slotTime || '').split('-');
  const s = timetableMinutes(a);
  let e = timetableMinutes(b);
  if (s == null || e == null) return false;
  if (e <= s) e += 12 * 60; // e.g. "12:00-01:00"
  return s < endMin && startMin < e;
}

/**
 * Validates and normalises the requested time. Returns { ok: { start, end, day, dateKey,
 * startMin, endMin, startHour, endHour } } or an error.
 */
/**
 * `direct`: the person books without approval (cras.bookings.direct) — weekends allowed.
 * `admin`: cras.admin — not limited to the booking window.
 */
export function checkTimes(startTime, endTime, { direct = false, admin = false, now = Date.now(), mode = 'create' } = {}) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!startTime || !endTime || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return bad('start_time and end_time must be valid timestamps');
  }
  if (end <= start) return bad('end_time must be after start_time');

  const s = getIstParts(start);
  const e = getIstParts(end);
  if (start.getUTCSeconds() || end.getUTCSeconds() || start.getUTCMilliseconds() || end.getUTCMilliseconds() || s.minute || e.minute) {
    return bad('Bookings start and end on the hour');
  }
  const hours = (end - start) / 3600000;
  if (hours < 1 || hours > RULES.MAX_HOURS) return bad(`Bookings last between 1 and ${RULES.MAX_HOURS} hours`);
  if (e.date !== s.date) return bad('A booking must start and end on the same day');
  const endHour = e.hour;
  if (s.hour < RULES.OPEN_HOUR || endHour > RULES.CLOSE_HOUR) {
    return bad(`Rooms can be booked between ${String(RULES.OPEN_HOUR).padStart(2, '0')}:00 and ${RULES.CLOSE_HOUR}:00`);
  }

  if (start.getTime() <= now) {
    return bad(mode === 'approve' ? 'This request is for a time that has already started' : 'Cannot book in the past');
  }
  if (mode !== 'approve' && !admin && start.getTime() > now + RULES.WINDOW_DAYS * 86400000) {
    return bad('Regular bookings allowed only for the current week');
  }
  if (mode !== 'approve' && !direct && (s.day === 'Sat' || s.day === 'Sun')) {
    return bad('Students are not allowed to book rooms on weekends');
  }
  return {
    ok: {
      start: start.toISOString(), end: end.toISOString(), day: s.day, dateKey: s.date,
      startHour: s.hour, endHour, startMin: s.hour * 60, endMin: endHour * 60,
    },
  };
}

/** Room existence and access: restricted rooms need cras.bookings.direct (`direct`). */
export function checkRoom(room, direct) {
  if (!room || room.is_active === false) return bad('Room not found', 404);
  if ((room.type === 'Committee Room' || room.type === 'Auditorium') && !direct) {
    return bad('Committee Rooms and Auditoriums can only be booked by Faculty or Admin', 403);
  }
  if (!direct && room.student_access === false) {
    return bad('Students do not have permission to book this room', 403);
  }
  return null;
}

/** Bookings that need approval must name an active faculty member. Returns { faculty } or an error. */
export async function checkFaculty(facultyId, direct, client, { required = true } = {}) {
  const given = facultyId !== undefined && facultyId !== null && facultyId !== '';
  if (!given) {
    if (required && !direct) return bad('Choose the faculty member who will approve this booking');
    return { faculty: null };
  }
  const faculty = await facultyRepository.findActiveById(facultyId, client);
  if (!faculty) return bad('Selected faculty member was not found');
  return { faculty };
}

/** Is [startHour, endHour) of this room released on dateKey (class cancelled/moved that day)? */
async function isReleased(client, roomId, dateKey, startHour, endHour) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM room_slot_releases
      WHERE room_id = $1 AND release_date = $2 AND is_active AND start_hour <= $3 AND end_hour >= $4 LIMIT 1`,
    [roomId, dateKey, startHour, endHour],
  );
  return rowCount > 0;
}

/** The room's own timetable: scheduled classes and admin weekly blocks (BKG-01). */
export async function checkRoomTimetable(client, room, t) {
  const { rows: classes } = await client.query(
    `SELECT slot_time, subject_name, faculty_name, department, semester, section
       FROM timetable_slots WHERE UPPER(TRIM(room_name)) = UPPER(TRIM($1)) AND day_of_week = $2`,
    [room.name, t.day],
  );
  const { rows: staffSlots } = await client.query(
    `SELECT slot_time, content AS subject_name, faculty_name FROM faculty_timetable_slots
      WHERE is_active AND is_occupied AND room_id = $1 AND day_of_week = $2`,
    [room.id, t.day],
  );
  // Each booked hour that has a class must be released on this date (NEW-P4-1: a release for 10–11
  // doesn't need to cover a free 11–12).
  let hit = null;
  for (let h = t.startHour; h < t.endHour && !hit; h++) {
    const cls = [...classes, ...staffSlots].find((c) => slotOverlaps(c.slot_time, h * 60, h * 60 + 60));
    if (cls && !(await isReleased(client, room.id, t.dateKey, h, h + 1))) hit = cls;
  }
  if (hit) {
    return bad(`Room ${room.name} has a scheduled class at this time`, 409, {
      conflict: {
        type: 'room_timetable', subject: hit.subject_name || 'Scheduled class', faculty: hit.faculty_name || null,
        room: room.name, day: t.day, time: hit.slot_time,
      },
    });
  }

  const { rows: blocks } = await client.query(
    `SELECT hour FROM room_availability
      WHERE room_id = $1 AND day = $2 AND is_available = FALSE AND is_active AND hour >= $3 AND hour < $4`,
    [room.id, t.day, t.startHour, t.endHour],
  );
  let blocked = false;
  for (const b of blocks) {
    if (!(await isReleased(client, room.id, t.dateKey, b.hour, b.hour + 1))) { blocked = true; break; }
  }
  if (blocked) {
    return bad(`Room ${room.name} is not available at this time`, 409, { conflict: { type: 'room_blocked', room: room.name, day: t.day } });
  }
  return null;
}

const DEPARTMENT_ALIASES = {
  IT: 'INFORMATION TECHNOLOGY',
  CS: 'COMPUTER SCIENCE AND ENGINEERING',
  CSE: 'COMPUTER SCIENCE AND ENGINEERING',
  ICE: 'INSTRUMENTATION AND CONTROL ENGINEERING',
  ECE: 'ELECTRONICS AND COMMUNICATION ENGINEERING',
  ME: 'MECHANICAL ENGINEERING',
  MPAE: 'MANUFACTURING PROCESS AND AUTOMATION ENGINEERING',
  EE: 'ELECTRICAL ENGINEERING',
  BT: 'BIOTECHNOLOGY',
};
const timetableDepartment = (branch) => {
  const n = String(branch || '').trim().toUpperCase();
  return n ? DEPARTMENT_ALIASES[n] || n : null;
};

const timetableConflict = (label, row, t) => ({
  type: 'timetable', label, subject: row.subject_name || 'Scheduled class', faculty: row.faculty_name || 'Unknown',
  room: row.room_name || null, day: t.day, time: row.slot_time || 'Unknown time',
});

async function facultyTimetableHit(client, facultyName, t) {
  const { rows } = await client.query(
    `SELECT slot_time, subject_name, faculty_name, room_name FROM timetable_slots
      WHERE UPPER(faculty_name) = UPPER($1) AND day_of_week = $2
     UNION ALL
     SELECT slot_time, content, faculty_name, NULL FROM faculty_timetable_slots
      WHERE is_active AND is_occupied AND UPPER(faculty_name) = UPPER($1) AND day_of_week = $2`,
    [facultyName, t.day],
  );
  // Classes the faculty member cancelled for this date don't count.
  const { rows: cancelled } = await client.query(
    `SELECT hour FROM faculty_slot_overrides WHERE UPPER(faculty_name) = UPPER($1) AND date = $2::date AND is_cancelled`,
    [facultyName, t.dateKey],
  );
  const off = new Set(cancelled.map((c) => c.hour));
  return rows.find((r) => slotOverlaps(r.slot_time, t.startMin, t.endMin)
    && !off.has(Math.floor(timetableMinutes(String(r.slot_time).split('-')[0]) / 60))) || null;
}

/** Does this person teach (linked to the faculty directory)? Identity, not a permission. */
async function teaches(client, person) {
  if (person.faculty_id !== undefined) return person.faculty_id != null;
  const { rowCount } = await client.query('SELECT 1 FROM faculties WHERE user_id = $1 AND is_active', [person.id]);
  return rowCount > 0;
}

/**
 * Timetable commitments of the people involved: the requester's section (students) or own
 * teaching timetable (faculty), and the selected faculty member's teaching timetable.
 */
export async function checkPeopleTimetables(client, requester, faculty, t) {
  if (requester && requester.name && await teaches(client, requester)) {
    const hit = await facultyTimetableHit(client, requester.name, t);
    if (hit) return bad('This booking clashes with an existing timetable slot in your timetable', 409, { conflict: timetableConflict('your timetable', hit, t) });
  } else if (requester) {
    const department = timetableDepartment(requester.branch || requester.department_name);
    // The ACL's semester only: guessing it from the year picked the wrong (even) semester for half the students.
    const semester = requester.semester;
    if (department && semester && requester.section != null) {
      const { rows } = await client.query(
        `SELECT slot_time, subject_name, faculty_name, room_name FROM timetable_slots
          WHERE UPPER(department) = $1 AND semester::TEXT = $2 AND section::TEXT = $3 AND day_of_week = $4`,
        [department, String(semester), String(requester.section), t.day],
      );
      const hit = rows.find((r) => slotOverlaps(r.slot_time, t.startMin, t.endMin));
      if (hit) {
        return bad('This booking clashes with an existing timetable slot in your section timetable', 409, {
          conflict: timetableConflict('your section timetable', hit, t),
        });
      }
    }
  }
  if (faculty?.name && await facultyTimetableHit(client, faculty.name, t)) {
    return bad('The selected faculty member is busy during this slot.', 409, { conflict: { type: 'faculty_busy' } });
  }
  return null;
}

/**
 * Existing bookings: the room (ACTIVE), the person (their ACTIVE/PENDING bookings, plus — for
 * faculty — the ACTIVE bookings they supervise), and the selected faculty member's commitments.
 * `excludeId` skips the booking being rescheduled or approved.
 */
export async function checkBookingConflicts(client, { roomId, personId, personFacultyId = null, faculty = null, t, excludeId = null }) {
  const overlap = `tstzrange(b.start_time, b.end_time) && tstzrange($2::timestamptz, $3::timestamptz) AND ($4::int IS NULL OR b.id <> $4)`;

  const room = await client.query(
    `SELECT b.id FROM bookings b WHERE b.room_id = $1 AND b.status = 'ACTIVE' AND ${overlap} LIMIT 1`,
    [roomId, t.start, t.end, excludeId],
  );
  if (room.rowCount) return bad('Room is already booked for this time period', 409, { conflict: { type: 'room_booked' } });

  if (personId) {
    const mine = await client.query(
      `SELECT r.name AS room_name, b.status FROM bookings b JOIN rooms r ON r.id = b.room_id
        WHERE ((b.created_by = $1 AND b.status IN ('ACTIVE','PENDING'))
               OR ($5::int IS NOT NULL AND b.faculty_id = $5 AND b.status = 'ACTIVE'))
          AND ${overlap} LIMIT 1`,
      [personId, t.start, t.end, excludeId, personFacultyId],
    );
    if (mine.rowCount) {
      const what = mine.rows[0].status === 'PENDING' ? 'a pending request' : 'another booking';
      return bad(`You already have ${what} during this time in Room ${mine.rows[0].room_name}`, 409, { conflict: { type: 'person_busy' } });
    }
  }

  if (faculty) {
    const busy = await client.query(
      `SELECT 1 FROM bookings b
        WHERE ((b.faculty_id = $1 AND b.status = 'ACTIVE')
               OR ($5::int IS NOT NULL AND b.created_by = $5 AND b.status IN ('ACTIVE','PENDING')))
          AND ${overlap} LIMIT 1`,
      [faculty.id, t.start, t.end, excludeId, faculty.user_id ?? null],
    );
    if (busy.rowCount) return bad('The selected faculty member is busy during this slot.', 409, { conflict: { type: 'faculty_busy' } });
  }
  return null;
}

/** Translate a DB exclusion-constraint violation (a lost race) into the same 409s. */
export function constraintConflict(err) {
  if (err?.code !== '23P01') return null;
  switch (err.constraint) {
    case 'bookings_no_room_overlap': return bad('Room is already booked for this time period', 409, { conflict: { type: 'room_booked' } });
    case 'bookings_no_person_overlap': return bad('You already have another booking or request during this time', 409, { conflict: { type: 'person_busy' } });
    case 'bookings_no_faculty_overlap': return bad('The selected faculty member is busy during this slot.', 409, { conflict: { type: 'faculty_busy' } });
    default: return bad('That time slot is no longer available', 409);
  }
}

/** The IST date of `weekday` in the Mon–Sun week containing dateKey. */
export function dateInSameWeek(dateKey, weekday) {
  const idx = DAYS.indexOf(weekday);
  if (idx < 0) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  const monOffset = (base.getUTCDay() + 6) % 7; // days since Monday
  const target = (idx + 6) % 7; // Mon=0 … Sun=6
  base.setUTCDate(base.getUTCDate() - monOffset + target);
  return base.toISOString().slice(0, 10);
}

export { istDateTimeToUtc, DAYS };

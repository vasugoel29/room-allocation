import { getIstParts, istDateTimeToUtc } from '../utils/timezone.js';
import { facultyRepository } from '../repositories/facultyRepository.js';
import { timetableRepository, sectionKey } from '../repositories/timetableRepository.js';
import { parseSlotTime, timetableMinutes, overlapsMinutes } from '../utils/timetableLogic.js';
import { BOOKING_RULES } from '../../../shared/bookingRules.js';

export { timetableMinutes };

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

export const RULES = BOOKING_RULES; // shared/bookingRules.js: the calendar offers the same hours

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


const bad = (error, status = 400, extra = {}) => ({ error, status, ...extra });

/** Does a timetable slot "HH:MM-HH:MM" overlap [startMin, endMin)? */
export function slotOverlaps(slotTime, startMin, endMin) {
  const t = parseSlotTime(slotTime);
  return Boolean(t) && t.startMin < endMin && startMin < t.endMin;
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

  if (end.getTime() <= now) {
    return bad(mode === 'approve' ? 'This request is for a time that has already ended' : 'Cannot book in the past');
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

const overlaps = (c, startMin, endMin) => overlapsMinutes(startMin, endMin, c);

/**
 * The room's classes during the booking that are not released for that date: one { cls, hour } per
 * class per booked hour (NEW-P4-1: a release for 10–11 doesn't need to cover a free 11–12).
 */
export async function unreleasedClassesAt(client, room, t) {
  const classes = await timetableRepository.roomClasses(room.id, t.day, client);
  const hits = [];
  for (let h = t.startHour; h < t.endHour; h++) {
    const here = classes.filter((c) => overlaps(c, h * 60, h * 60 + 60));
    if (here.length && !(await timetableRepository.isReleased(room.id, t.dateKey, h, h + 1, client))) {
      for (const cls of here) hits.push({ cls, hour: h });
    }
  }
  return hits;
}

/**
 * The room's own timetable: scheduled classes (by room id) and admin weekly blocks (BKG-01).
 * `ignoreClasses`: an admin booking replaces the classes instead (classDisplacement.js).
 */
export async function checkRoomTimetable(client, room, t, { ignoreClasses = false } = {}) {
  const hit = ignoreClasses ? null : (await unreleasedClassesAt(client, room, t))[0]?.cls;
  if (hit) {
    return bad(`Room ${room.name} has a scheduled class at this time`, 409, {
      conflict: {
        type: 'room_timetable', subject: hit.subject_name || 'Scheduled class', faculty: hit.faculty_name || null,
        room: room.name, day: t.day, time: hit.slot_time,
      },
    });
  }

  const blocks = (await timetableRepository.blockedHours(room.id, t.day, client)).filter((h) => h >= t.startHour && h < t.endHour);
  for (const h of blocks) {
    if (!(await timetableRepository.isReleased(room.id, t.dateKey, h, h + 1, client))) {
      return bad(`Room ${room.name} is not available at this time`, 409, { conflict: { type: 'room_blocked', room: room.name, day: t.day } });
    }
  }
  return null;
}

const timetableConflict = (label, row, t) => ({
  type: 'timetable', label, subject: row.subject_name || 'Scheduled class', faculty: row.faculty_name || 'Unknown',
  room: row.room_name || null, day: t.day, time: row.slot_time || 'Unknown time',
});

/** A class this faculty member teaches during the slot, skipping classes they cancelled for that date. */
export async function facultyClassAt(client, facultyId, t) {
  if (facultyId == null) return null;
  const classes = (await timetableRepository.facultyClasses(facultyId, t.day, client)).filter((c) => overlaps(c, t.startMin, t.endMin));
  if (!classes.length) return null;
  const off = await timetableRepository.cancelledHours(facultyId, t.dateKey, client);
  return classes.find((c) => !off.has(Math.floor(c.start_min / 60))) || null;
}

/** The directory entry of a person who teaches (identity, not a permission), or null. */
async function facultyIdOf(client, person) {
  if (person.faculty_id !== undefined) return person.faculty_id;
  const { rows } = await client.query('SELECT id FROM faculties WHERE user_id = $1 AND is_active ORDER BY id LIMIT 1', [person.id]);
  return rows[0]?.id ?? null;
}

/**
 * Timetable commitments of the people involved: the requester's section (students, matched on the
 * ACL branch + semester + section) or own teaching timetable (faculty), and the selected faculty
 * member's teaching timetable.
 */
export async function checkPeopleTimetables(client, requester, faculty, t) {
  const requesterFacultyId = requester ? await facultyIdOf(client, requester) : null;
  if (requesterFacultyId != null) {
    const hit = await facultyClassAt(client, requesterFacultyId, t);
    if (hit) return bad('This booking clashes with an existing timetable slot in your timetable', 409, { conflict: timetableConflict('your timetable', hit, t) });
  } else if (requester) {
    const key = sectionKey(requester);
    const hit = (await timetableRepository.sectionClasses(key, t.day, client)).find((c) => overlaps(c, t.startMin, t.endMin));
    if (hit) {
      return bad('This booking clashes with an existing timetable slot in your section timetable', 409, {
        conflict: timetableConflict('your section timetable', hit, t),
      });
    }
  }
  if (faculty?.id && await facultyClassAt(client, faculty.id, t)) {
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
      `SELECT r.name AS room_name, b.status, f.name AS faculty_name 
        FROM bookings b 
        JOIN rooms r ON r.id = b.room_id
        LEFT JOIN faculties f ON f.id = b.faculty_id
        WHERE ((b.created_by = $1 AND b.status IN ('ACTIVE','PENDING'))
               OR ($5::int IS NOT NULL AND b.faculty_id = $5 AND b.status = 'ACTIVE'))
          AND ${overlap} LIMIT 1`,
      [personId, t.start, t.end, excludeId, personFacultyId],
    );
    if (mine.rowCount) {
      const what = mine.rows[0].status === 'PENDING' ? 'a pending request' : 'another booking';
      const facultyText = mine.rows[0].faculty_name ? ` with Prof. ${mine.rows[0].faculty_name}` : '';
      return bad(`You already have ${what}${facultyText} during this time in Room ${mine.rows[0].room_name}`, 409, { conflict: { type: 'person_busy' } });
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

import * as db from '../db.js';
import { timetableRepository as tt, sectionKey } from '../repositories/timetableRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { facultyRepository } from '../repositories/facultyRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { getDayOfWeek, normalizeDay, parseSlotTime } from '../utils/timetableLogic.js';
import { istToday, isDateKey } from '../utils/timezone.js';
import { invalidateRoomCaches } from '../utils/cache.js';
import { notify } from '../notifications/notify.js';
import { logActivity } from './loggerService.js';
import { facultyClassAt } from './bookingRules.js';
import { importSectionSlots } from './timetableImport.js';

/**
 * Timetable rules: the student's section timetable, a faculty member's own classes and their
 * one-date cancellations, class-cancellation requests, admin search and the faculty-slot editor.
 * Every function returns `{ data }` or `{ error, status }`; SQL lives in timetableRepository.
 */

const ok = (data) => ({ data });
const bad = (error, status = 400) => ({ error, status });
const titleCase = (s) => String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** The student's section, as the ACL sends it: branch + semester + section (exact match). */
export const sectionTimetable = async (principal) => ok(await tt.sectionClasses(sectionKey(principal)));

/** Admin import of section timetables (see timetableImport.js). */
export async function importSections(slots, actor) {
  if (!Array.isArray(slots) || !slots.length) return bad('slots must be a non-empty array');
  const result = await db.runInTransaction(async (client) => {
    const r = await importSectionSlots(client, slots);
    await logActivity({
      userId: actor.id, action: 'IMPORT_SECTION_TIMETABLE', entityType: 'timetable',
      details: { ...r, rejected: r.rejected.length, unresolved: { rooms: r.unresolved.rooms.length, faculty: r.unresolved.faculty.length } },
    }, client);
    return r;
  });
  invalidateRoomCaches();
  return ok({ message: `Timetable imported for ${result.sections} section(s)`, ...result });
}

/** The caller's faculty timetable slots, grouped by day (the Faculty Portal view). */
export async function ownFacultySlots(principal, day) {
  if (principal.faculty_id == null) return ok({});
  const rows = await tt.facultySlotsOf(principal.faculty_id, day ? normalizeDay(day) : null);
  return ok(rows.reduce((acc, slot) => {
    (acc[slot.day_of_week] ||= []).push(slot);
    return acc;
  }, {}));
}

/** Is this faculty member free for that hour? The rule the booking check applies; no details exposed. */
export async function facultyAvailability(facultyId, date, hourValue) {
  const hour = Number(hourValue);
  if (!isDateKey(date) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return bad('date (YYYY-MM-DD) and hour (0-23) are required');
  }
  // `facultyId` is a faculty-directory id (what the faculty picker returns).
  if (!(await facultyRepository.findActiveById(facultyId))) return bad('Faculty not found', 404);

  // Their classes (minus ones they cancelled that date), and bookings they supervise.
  const t = { day: getDayOfWeek(date), dateKey: date, startMin: hour * 60, endMin: hour * 60 + 60 };
  const busyClass = Boolean(await facultyClassAt(db, Number(facultyId), t));
  const busyBooking = await bookingRepository.facultySupervisesAt(facultyId, date, hour);
  const isOccupied = busyClass || busyBooking;
  return ok({ isOccupied, reason: isOccupied ? (busyBooking ? 'Dynamic Booking' : 'Static Class') : null, details: null });
}

/**
 * A faculty member cancels (or restores) one of their own classes for one date. The class's room
 * is released for that date and hour only, so it can be booked; timetables drop the class that day.
 */
export async function setOwnClassCancelled(principal, { date, hour, cancel }) {
  if (date < istToday()) return bad('Classes in the past cannot be changed.');
  const facultyId = principal.faculty_id ?? null;
  const classes = facultyId == null ? [] : await tt.facultyClasses(facultyId, getDayOfWeek(date));
  const slot = classes.find((c) => c.start_min < hour * 60 + 60 && hour * 60 < c.end_min);
  if (!slot) return bad('You have no class at that time.', 404);

  const override = await db.runInTransaction(async (client) => {
    const o = await tt.upsertOverride({ facultyId, date, hour, cancelled: cancel, by: principal.id }, client);
    // Withdraw any earlier release for this override, then release again if cancelled.
    await tt.withdrawReleases('faculty_override', o.id, client);
    if (cancel && slot.room_id) {
      await tt.release({ roomId: slot.room_id, date, startHour: hour, endHour: hour + 1, sourceType: 'faculty_override', sourceId: o.id, by: principal.id }, client);
    }
    await logActivity({
      userId: principal.id, action: cancel ? 'CANCEL_OWN_CLASS' : 'RESTORE_OWN_CLASS', entityType: 'faculty_override',
      entityId: o.id, details: { date, hour, room_id: slot.room_id ?? null },
    }, client);
    return o;
  });
  invalidateRoomCaches();
  return ok({ message: cancel ? 'Class cancelled for that date; the room is free.' : 'Class restored.', override });
}

export const ownCancelledClasses = async (principal) => ok(await tt.cancelledClasses(principal.faculty_id ?? -1));

/** Template data for a class-cancellation request (IST date and the one-hour slot). */
function classFacts(request, extra) {
  const pad = (h) => String(h).padStart(2, '0');
  // pg parses DATE as local midnight: read the local parts, not toISOString (which can shift a day).
  const d = request.class_date;
  const dateKey = d instanceof Date ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : String(d).slice(0, 10);
  return {
    subject: request.subject_name || 'the class',
    roomName: request.room_name,
    date: dateKey,
    time: `${pad(request.hour)}:00 – ${pad(request.hour + 1)}:00`,
    ...extra,
  };
}

/** A student asks the class's teacher to cancel it for one date (optionally linked to their booking). */
export async function requestClassCancellation(principal, { room_name, subject_name, date, hour, faculty_name, booking_id }) {
  if (!room_name || !date || hour === undefined || !faculty_name) return bad('Room, date, hour, and faculty are required.');
  const h = Number(hour);
  if (!isDateKey(date)) return bad('date must be a real YYYY-MM-DD date.');
  if (!Number.isInteger(h) || h < 0 || h > 23) return bad('hour must be between 0 and 23.');
  const room = await roomRepository.findByName(room_name);
  if (!room) return bad(`Room ${room_name} not found.`, 404);
  // A linked booking must be the one in this room at this date and hour (BKG-12).
  if (booking_id && !(await bookingRepository.openInRoomAt(booking_id, room.id, date, h))) {
    return bad('The booking does not match this room, date and hour.');
  }
  const faculty = await facultyRepository.findActiveByName(faculty_name);
  if (!faculty) return bad('The class faculty could not be found, so approval cannot be requested.', 404);

  try {
    const request = await db.runInTransaction(async (client) => {
      const row = await tt.createCancellationRequest({
        requestedBy: principal.id, facultyId: faculty.id, roomId: room.id, subjectName: subject_name, date, hour: h, bookingId: booking_id,
      }, client);
      const r = { ...row, room_name: room.name };
      await notify(client, [{ facultyId: r.faculty_id }], 'class_cancellation_requested',
        classFacts(r, { requesterName: principal.name || 'A student' }),
        { actorId: principal.id, entityType: 'class_cancellation', entityId: r.id });
      return r;
    });
    return ok({ message: 'Cancellation request sent to the faculty member for approval.', request });
  } catch (err) {
    if (err.code === '23505') return bad('A cancellation request for this class is already awaiting faculty approval.', 409);
    throw err;
  }
}

export const pendingCancellationRequests = async (principal) => ok(await tt.pendingCancellationRequests(principal.faculty_id ?? -1));

/** The class's teacher approves (room released for that date, or the linked booking cancelled) or rejects. */
export async function reviewCancellationRequest(principal, id, action) {
  const approved = action === 'approve';
  if (!approved && action !== 'reject') return bad('Invalid action.');

  const result = await db.runInTransaction(async (client) => {
    const request = await tt.lockPendingCancellationRequest(id, principal.faculty_id ?? -1, client);
    if (!request) return bad('Cancellation request was not found or has already been reviewed.', 404);
    if (approved) {
      if (request.booking_id) {
        // Only the still-open booking the request was made for (soft cancel; history kept).
        await bookingRepository.cancelIfOpen(request.booking_id, client);
      } else {
        if (!request.room_id || !request.room_active) return bad('The room for this class no longer exists.', 409);
        // The class doesn't happen on this one date: release that hour for that date only (BKG-05).
        await tt.release({
          roomId: request.room_id, date: request.class_date, startHour: request.hour, endHour: request.hour + 1,
          sourceType: 'cancellation_request', sourceId: request.id, by: principal.id,
        }, client);
      }
    }
    await tt.decideCancellationRequest(request.id, approved ? 'APPROVED' : 'REJECTED', principal.id, client);
    await notify(client, [{ userId: request.requested_by }], 'class_cancellation_decided',
      classFacts(request, { approved, by: principal.name || 'Faculty' }),
      { actorId: principal.id, entityType: 'class_cancellation', entityId: request.id });
    return ok({ message: approved ? 'Cancellation approved; the room is now available.' : 'Cancellation request rejected.' });
  });
  if (!result.error) invalidateRoomCaches();
  return result;
}

export const branches = async () => ok(await tt.branches());

/** Admin search: a teacher's or a section's classes, with the ACTIVE bookings that belong to them. */
export async function search({ type, name, department, semester, section }) {
  const blank = (v) => typeof v !== 'string' || !v.trim();
  if (type === 'FACULTY') {
    if (blank(name)) return bad('name is required for a faculty search');
    const facultyName = name.trim().toUpperCase();
    return ok({
      type: 'FACULTY',
      name: facultyName,
      staticSlots: await tt.classesForFacultyName(facultyName),
      dynamicBookings: await bookingRepository.activeForFacultyName(facultyName),
    });
  }
  if (type === 'SECTION') {
    if (blank(department) || blank(semester) || blank(section)) {
      return bad('department, semester and section are required for a section search');
    }
    // The ACL section key: branch + semester + section, matched exactly.
    const key = sectionKey({ branch: department, semester, section });
    if (!key) return bad('semester and section must be numbers');
    return ok({
      type: 'SECTION', department: key.department, semester: key.semester, section: key.section,
      staticSlots: await tt.sectionClasses(key),
      dynamicBookings: await bookingRepository.activeForSection(key),
    });
  }
  return bad('Invalid search type');
}

export const autocompleteFaculty = async (query) => ok(query ? (await tt.facultyNamesLike(query)).map(titleCase) : []);

// ── Admin editor for faculty timetable slots ───────────────────────────────────────────────

export async function listFacultySlots(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 50));
  const { rows, total } = await tt.listFacultySlots({
    faculty_name: query.faculty_name, day_of_week: query.day_of_week, semester: query.semester, limit, offset: (page - 1) * limit,
  });
  return ok({ data: rows, meta: { total, page, limit } });
}

/**
 * Validates the slot fields that are present. The teacher must be in the faculty directory
 * (classes are matched by faculty_id), the day a weekday and the time readable.
 */
async function slotFields(body) {
  const out = { semester: body.semester, content: body.content, is_occupied: body.is_occupied, room_id: body.room_id };
  if (body.faculty_name !== undefined) {
    const f = await facultyRepository.findActiveByName(body.faculty_name);
    if (!f) return bad(`${body.faculty_name} is not in the faculty directory`);
    Object.assign(out, { faculty_name: f.name, faculty_id: f.id });
  }
  if (body.day_of_week !== undefined) {
    out.day_of_week = normalizeDay(body.day_of_week);
    if (!out.day_of_week) return bad('day_of_week must be a weekday (Mon–Sun)');
  }
  if (body.slot_time !== undefined) {
    const t = parseSlotTime(body.slot_time);
    if (!t) return bad('slot_time must look like 09:00-10:00');
    Object.assign(out, { slot_time: String(body.slot_time).trim(), start_min: t.startMin, end_min: t.endMin });
  }
  return ok(out);
}

export async function createFacultySlot(body) {
  if (!body.faculty_name || !body.day_of_week || !body.slot_time) return bad('faculty_name, day_of_week, and slot_time are required');
  const fields = await slotFields(body);
  if (fields.error) return fields;
  const slot = await tt.createFacultySlot(fields.data);
  invalidateRoomCaches();
  return ok(slot);
}

export async function updateFacultySlot(id, body) {
  const fields = await slotFields(body);
  if (fields.error) return fields;
  const slot = await tt.updateFacultySlot(id, fields.data, { setRoom: Object.hasOwn(body, 'room_id') });
  if (!slot) return bad('Slot not found', 404);
  invalidateRoomCaches();
  return ok(slot);
}

/** Soft delete. */
export async function deleteFacultySlot(id) {
  if (!(await tt.deactivateFacultySlot(id))) return bad('Slot not found', 404);
  invalidateRoomCaches();
  return ok({ success: true });
}

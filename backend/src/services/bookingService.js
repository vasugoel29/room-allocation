import * as db from '../db.js';
import logger from '../utils/logger.js';
import { invalidateRoomCaches } from '../utils/cache.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { facultyRepository } from '../repositories/facultyRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { timetableRepository } from '../repositories/timetableRepository.js';
import { cancelClassesForBooking, restoreClassesForBookings } from './classDisplacement.js';
import { notify, bookingFacts, personName } from '../notifications/notify.js';
import { canBookDirect, isAdmin } from '../auth/permissions.js';
import { logActivity } from './loggerService.js';
import { dateKeyToDays, isDateKey } from '../utils/timezone.js';
import {
  checkTimes, checkRoom, checkFaculty, checkRoomTimetable, checkPeopleTimetables, checkBookingConflicts, unreleasedClassesAt,
  constraintConflict, dateInSameWeek, istDateTimeToUtc, DAYS,
} from './bookingRules.js';

export const MAX_BOOKINGS_PAGE = 1000;

/**
 * Fetch bookings with optional filters
 */
export const getBookings = async (filters) => {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(MAX_BOOKINGS_PAGE, Math.max(1, parseInt(filters.limit) || 20));
  const offset = (page - 1) * limit;

  const [bookings, total] = await Promise.all([
    bookingRepository.findBookings({ ...filters, limit, offset }),
    bookingRepository.countBookings(filters)
  ]);

  return {
    data: bookings,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const CALENDAR_MAX_DAYS = 31;
export const MAX_MINE = 500;

/**
 * Calendar occupancy window: the IST days from..to (inclusive), at most CALENDAR_MAX_DAYS.
 * Replaces the 1000-row `GET /bookings` download (PERF-01, FE-12).
 */
export const calendarRange = ({ from, to }) => {
  const a = dateKeyToDays(from);
  const b = dateKeyToDays(to);
  if (a === null || b === null) return { error: 'from and to must be dates (YYYY-MM-DD)', status: 400 };
  if (b < a) return { error: 'to must not be before from', status: 400 };
  if (b - a + 1 > CALENDAR_MAX_DAYS) return { error: `The calendar window is at most ${CALENDAR_MAX_DAYS} days`, status: 400 };
  const toNext = new Date((b + 1) * 86_400_000).toISOString().slice(0, 10);
  return { from, to, startUtc: istDateTimeToUtc(from, 0), endUtc: istDateTimeToUtc(toNext, 0) };
};

/** ACTIVE and PENDING bookings overlapping a window from calendarRange(). */
export const getCalendarRows = (range) => bookingRepository.findOpenInRange(range.startUtc, range.endUtc);

/** The caller's own bookings plus those they supervise as faculty (History, faculty dashboard). */
export const getMine = async (principal, { limit } = {}) => {
  const n = Math.min(MAX_MINE, Math.max(1, parseInt(limit) || MAX_MINE));
  return bookingRepository.findForPerson(principal.id, principal.faculty_id ?? null, n);
};

const RETRYABLE = new Set(['40P01', '40001']); // deadlock / serialization failure between racing bookings

/**
 * Runs `fn` in a transaction; returned/thrown `{ error }` objects and lost races come back as
 * results. Deadlocks between racing requests are retried, then reported as a 409 (NEW-P4-7).
 */
export async function inTransaction(fn, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.runInTransaction(async (client) => {
        const res = await fn(client);
        // `commit: true` marks an error whose bookkeeping writes must persist (e.g. closing a
        // transfer whose booking became unavailable — NEW-P4-T1); every other error rolls back.
        if (res?.error && !res.commit) throw res;
        return res;
      });
    } catch (err) {
      if (err?.error) return err;
      if (RETRYABLE.has(err?.code)) {
        if (attempt < attempts) continue;
        return { error: 'That time slot was just taken — please try again', status: 409, conflict: { type: 'race' } };
      }
      const raced = constraintConflict(err);
      if (raced) return raced;
      throw err;
    }
  }
}

/** When a reschedule booking becomes ACTIVE, the class it replaces is released for that date. */
async function activateRescheduleRelease(client, booking, actorId) {
  if (!booking.reschedule_room_id || !booking.reschedule_date || booking.reschedule_hour == null) return;
  await timetableRepository.release({
    roomId: booking.reschedule_room_id, date: booking.reschedule_date, startHour: booking.reschedule_hour,
    endHour: booking.reschedule_hour + 1, sourceType: 'reschedule', sourceId: booking.id, by: actorId,
  }, client);
}

const deactivateReleasesFor = (client, sourceType, sourceId) => timetableRepository.withdrawReleases(sourceType, sourceId, client);

/** RESCHEDULE-type request: which timetabled class (room, date, hour) this booking replaces. */
async function resolveRescheduleSource(client, reqData, dateKey, startHour) {
  if (!reqData.reschedule_room_name) return { source: null };
  const room = await roomRepository.findByName(reqData.reschedule_room_name, client);
  if (!room) return { error: `Room ${reqData.reschedule_room_name} not found`, status: 404 };
  const day = reqData.reschedule_day || null;
  if (day && !DAYS.includes(day)) return { error: 'reschedule_day must be a weekday name (Mon–Sat)', status: 400 };
  const hour = reqData.reschedule_hour !== undefined && reqData.reschedule_hour !== null ? Number(reqData.reschedule_hour) : startHour;
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { error: 'reschedule_hour must be an hour between 0 and 23', status: 400 };
  return { source: { reschedule_room_id: room.id, reschedule_date: day ? dateInSameWeek(dateKey, day) : dateKey, reschedule_hour: hour } };
}

/**
 * Creates a booking for `owner` (the requester, or the target user of an admin quick-book).
 * `actor` is who performed the action (for rules and the audit trail).
 */
export const createBooking = async (client, reqData, owner, actor = owner, { requireFaculty = true } = {}) => {
  // What the actor may do decides the rules (cras.bookings.direct / cras.admin), never a role name.
  const direct = canBookDirect(actor);
  const admin = isAdmin(actor);
  const times = checkTimes(reqData.start_time, reqData.end_time, { direct, admin });
  if (times.error) return times;
  const t = times.ok;

  const room = await roomRepository.findById(reqData.room_id, client);
  const roomErr = checkRoom(room, direct);
  if (roomErr) return roomErr;

  const fac = await checkFaculty(reqData.faculty_id, direct, client, { required: requireFaculty });
  if (fac.error) return fac;

  const reschedule = await resolveRescheduleSource(client, reqData, t.dateKey, t.startHour);
  if (reschedule.error) return reschedule;

  const ownerProfile = await userRepository.findById(owner.id, client);
  const profile = { ...ownerProfile, role: owner.role, faculty_id: owner.faculty_id ?? null };

  // Requests wait for the named faculty member unless the actor may book directly.
  const status = fac.faculty && !direct ? 'PENDING' : 'ACTIVE';
  // An admin's booking replaces a timetabled class in the room for that date (decision 2026-10-22).
  const replacesClasses = admin && status === 'ACTIVE';
  const displaced = replacesClasses ? await unreleasedClassesAt(client, room, t) : [];
  const roomTimetable = await checkRoomTimetable(client, room, t, { ignoreClasses: replacesClasses });
  if (roomTimetable) return roomTimetable;
  // Admins booking for themselves aren't held to a section timetable; the people involved are.
  const people = await checkPeopleTimetables(client, admin && owner.id === actor.id ? null : profile, fac.faculty, t);
  if (people) return people;
  const conflict = await checkBookingConflicts(client, {
    roomId: room.id, personId: owner.id, personFacultyId: profile.faculty_id, faculty: fac.faculty, t,
  });
  if (conflict) return conflict;

  const booking = await bookingRepository.create({
    room_id: room.id, start_time: t.start, end_time: t.end, created_by: owner.id, purpose: reqData.purpose,
    faculty_id: fac.faculty?.id ?? null, status, ...(reschedule.source || {}),
  }, client);
  if (status === 'ACTIVE') await activateRescheduleRelease(client, booking, actor.id);
  await cancelClassesForBooking(client, { booking, room, t, hits: displaced, actor });

  await logActivity({
    userId: actor.id,
    action: status === 'PENDING' ? 'REQUEST_BOOKING' : 'CREATE_BOOKING',
    entityType: 'booking',
    entityId: booking.id,
    details: { room_id: room.id, start_time: t.start, end_time: t.end, on_behalf_of: owner.id !== actor.id ? owner.id : undefined },
  }, client);

  const facts = await bookingFacts(client, booking.id);
  const meta = { actorId: actor.id, entityType: 'booking', entityId: booking.id };
  if (status === 'PENDING') {
    await notify(client, [{ facultyId: fac.faculty.id }], 'booking_requested', { ...facts.data, studentName: facts.data.ownerName }, meta);
  }
  if (owner.id !== actor.id) {
    await notify(client, [{ userId: owner.id }], 'booking_created_for_you', { ...facts.data, by: actor.name || 'An administrator' }, meta);
  }

  return { data: booking, status: 201, faculty: fac.faculty, room };
};

export const createBookingHandler = async (reqData, user) => {
  const result = await inTransaction((client) => createBooking(client, reqData, user, user));
  if (result.error) return result;

  invalidateRoomCaches();
  logger.info('Booking created', { booking_id: result.data.id, user_id: user.id, room_id: result.data.room_id });
  return { data: result.data, status: 201 };
};

/**
 * Cancel a booking (creator, its supervising faculty, or an admin). Only upcoming ACTIVE/PENDING
 * bookings can be cancelled; open transfer requests on it are closed and any class release it
 * created is withdrawn.
 */
export const cancelBooking = async (client, bookingId, userId, isAdmin, actorFacultyId = null, { reason = null } = {}) => {
  const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
  if (!booking) return { error: 'Booking not found', status: 404 };
  const isCreator = String(booking.created_by) === String(userId);
  const isAssignedFaculty = actorFacultyId != null && String(booking.faculty_id) === String(actorFacultyId);
  if (!isCreator && !isAssignedFaculty && !isAdmin) return { error: 'Not authorized', status: 403 };
  if (!['ACTIVE', 'PENDING'].includes(booking.status)) {
    return { error: `This booking is already ${String(booking.status).toLowerCase()}`, status: 409 };
  }
  if (new Date(booking.end_time).getTime() <= Date.now()) return { error: 'Past bookings cannot be cancelled', status: 400 };

  await bookingRepository.updateStatus(bookingId, 'CANCELLED', client);
  await client.query(
    `UPDATE booking_transfers SET status = 'REJECTED', updated_at = NOW()
      WHERE booking_id = $1 AND status NOT IN ('ACCEPTED', 'REJECTED')`,
    [bookingId],
  );
  await deactivateReleasesFor(client, 'reschedule', booking.id);
  // Classes this booking had replaced go ahead after all.
  await restoreClassesForBookings(client, booking.id, { actorId: userId, reason: 'cancelled' });

  await logActivity({
    userId,
    action: 'CANCEL_BOOKING',
    entityType: 'booking',
    entityId: bookingId,
    details: { previous_status: booking.status, by: isCreator ? 'creator' : isAssignedFaculty ? 'faculty' : 'admin' },
  }, client);

  const facts = await bookingFacts(client, booking.id);
  const meta = { actorId: userId, entityType: 'booking', entityId: booking.id };
  const by = await personName(client, userId);
  await notify(client, [{ userId: booking.created_by }], 'booking_cancelled', { ...facts.data, by, reason }, meta);
  if (booking.faculty_id) {
    // The supervising faculty hears about a request that is withdrawn or an approved booking that is cancelled.
    await notify(client, [{ facultyId: booking.faculty_id }],
      booking.status === 'PENDING' ? 'booking_request_withdrawn' : 'supervised_booking_cancelled',
      { ...facts.data, studentName: facts.data.ownerName, by, reason }, meta);
  }

  return { status: 200, booking };
};

export const cancelBookingHandler = async (bookingId, user) => {
  const result = await inTransaction((client) =>
    cancelBooking(client, bookingId, user.id, isAdmin(user), user.faculty_id ?? null));
  if (result.error) return result;

  invalidateRoomCaches();
  logger.info('Booking cancelled', { booking_id: bookingId, user_id: user.id });
  return { status: 200 };
};

/**
 * Reschedule (move) the caller's own upcoming ACTIVE or PENDING booking. The new time and room go
 * through exactly the same rules as a new booking.
 */
export const rescheduleBooking = async (client, bookingId, data, user) => {
  const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
  if (!booking) return { error: 'Booking not found', status: 404 };
  // The owner, or an admin on their behalf (decision 2026-10-20). The owner's own commitments still apply.
  const byAdmin = booking.created_by !== user.id;
  if (byAdmin && !isAdmin(user)) return { error: 'Not authorized', status: 403 };
  if (!['ACTIVE', 'PENDING'].includes(booking.status)) return { error: `A ${String(booking.status).toLowerCase()} booking can't be moved`, status: 409 };
  if (new Date(booking.start_time).getTime() <= Date.now()) return { error: 'Bookings that have started cannot be moved', status: 400 };

  const startTime = data.start_time || booking.start_time;
  let endTime = data.end_time || booking.end_time;
  if (data.start_time && !data.end_time) {
    const length = new Date(booking.end_time) - new Date(booking.start_time);
    const moved = new Date(data.start_time);
    endTime = Number.isNaN(moved.getTime()) ? data.start_time : new Date(moved.getTime() + length).toISOString();
  }
  const direct = canBookDirect(user);
  const times = checkTimes(startTime, endTime, { direct, admin: isAdmin(user) });
  if (times.error) return times;
  const t = times.ok;

  const room = await roomRepository.findById(data.room_id || booking.room_id, client);
  const roomErr = checkRoom(room, direct);
  if (roomErr) return roomErr;
  const faculty = booking.faculty_id ? await facultyRepository.findActiveById(booking.faculty_id, client) : null;

  const ownerRow = await userRepository.findById(booking.created_by, client);
  const profile = byAdmin ? ownerRow : { ...ownerRow, role: user.role };
  const ownerFacultyId = byAdmin ? null : (user.faculty_id ?? null);
  // Moving the booking gives back any class it had replaced; an admin's move may replace the
  // classes at the new time (decision 2026-10-22).
  const slotChanges = t.start !== new Date(booking.start_time).toISOString() || t.end !== new Date(booking.end_time).toISOString()
    || room.id !== booking.room_id;
  if (slotChanges) await restoreClassesForBookings(client, booking.id, { actorId: user.id, reason: 'moved to another time' });
  const replacesClasses = isAdmin(user) && booking.status === 'ACTIVE';
  const displaced = replacesClasses ? await unreleasedClassesAt(client, room, t) : [];
  const roomTimetable = await checkRoomTimetable(client, room, t, { ignoreClasses: replacesClasses });
  if (roomTimetable) return roomTimetable;
  const people = await checkPeopleTimetables(client, profile, faculty, t);
  if (people) return people;
  const conflict = await checkBookingConflicts(client, {
    roomId: room.id, personId: booking.created_by, personFacultyId: ownerFacultyId, faculty, t, excludeId: booking.id,
  });
  if (conflict) return conflict;

  let updated = await bookingRepository.updateBooking(bookingId, { start_time: t.start, end_time: t.end, room_id: room.id }, client);
  await cancelClassesForBooking(client, { booking: updated, room, t, hits: displaced, actor: user });
  // A student's approved booking that moves needs its faculty to approve the new slot (NEW-P4-2).
  const moved = t.start !== new Date(booking.start_time).toISOString() || t.end !== new Date(booking.end_time).toISOString() || room.id !== booking.room_id;
  if (moved && !byAdmin && !direct && booking.faculty_id && booking.status === 'ACTIVE') {
    updated = await bookingRepository.updateStatus(bookingId, 'PENDING', client);
    await deactivateReleasesFor(client, 'reschedule', booking.id);
  }
  if (moved && byAdmin) {
    const facts = await bookingFacts(client, booking.id);
    await notify(client, [{ userId: booking.created_by }], 'booking_moved', { ...facts.data, by: user.name || 'An administrator' },
      { actorId: user.id, entityType: 'booking', entityId: booking.id });
  } else if (moved && booking.faculty_id && !direct) {
    const facts = await bookingFacts(client, booking.id);
    await notify(client, [{ facultyId: booking.faculty_id }],
      booking.status === 'ACTIVE' ? 'booking_rescheduled' : 'booking_requested',
      { ...facts.data, studentName: facts.data.ownerName }, { actorId: user.id, entityType: 'booking', entityId: booking.id });
  }

  await logActivity({
    userId: user.id,
    action: 'RESCHEDULE_BOOKING',
    entityType: 'booking',
    entityId: bookingId,
    // The audit log is the booking's change history (previous and new time and room).
    details: { old: { start_time: booking.start_time, end_time: booking.end_time, room_id: booking.room_id }, new: { start_time: t.start, end_time: t.end, room_id: room.id }, by: byAdmin ? 'admin' : 'owner' },
  }, client);
  return { data: updated, status: 200 };
};

export const rescheduleBookingHandler = async (bookingId, reqData, user) => {
  const result = await inTransaction((client) => rescheduleBooking(client, bookingId, reqData, user));
  if (result.error) return result;
  invalidateRoomCaches();
  return result;
};

/**
 * Faculty Portal Queries
 */
export const getPendingFacultyRequests = async (facultyId) => {
  return bookingRepository.findPendingByFaculty(facultyId);
};

/**
 * Approve a PENDING request. The slot is re-validated as of now (still in the future, room still
 * free and not in a class, requester and faculty still available); overlapping PENDING requests
 * for the same room are rejected.
 */
export const approveBooking = async (client, id, actor, isAdmin) => {
  const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
  if (!booking) return { error: 'Booking not found', status: 404 };
  if (!isAdmin && (actor.faculty_id == null || booking.faculty_id !== actor.faculty_id)) return { error: 'Not authorized', status: 403 };
  if (booking.status !== 'PENDING') return { error: 'Booking is not pending', status: 400 };

  const times = checkTimes(booking.start_time, booking.end_time, { direct: true, admin: true, mode: 'approve' });
  if (times.error) return times;
  const t = times.ok;
  const room = await roomRepository.findById(booking.room_id, client);
  if (!room || !room.is_active) return { error: 'Room is no longer available', status: 409 };
  const faculty = booking.faculty_id ? await facultyRepository.findById(booking.faculty_id, client) : null;

  const roomTimetable = await checkRoomTimetable(client, room, t);
  if (roomTimetable) return roomTimetable;
  const conflict = await checkBookingConflicts(client, {
    roomId: room.id, personId: booking.created_by, faculty, t, excludeId: booking.id,
  });
  if (conflict) return conflict;

  const approved = await bookingRepository.updateStatus(id, 'ACTIVE', client);
  await activateRescheduleRelease(client, approved, actor.id);
  await logActivity({
    userId: actor.id,
    action: 'APPROVE_BOOKING',
    entityType: 'booking',
    entityId: id,
    details: { approved_by: isAdmin ? 'ADMIN' : 'FACULTY' },
  }, client);
  const { rows: overlapping } = await bookingRepository.rejectConflicts(booking.room_id, id, booking.start_time, booking.end_time, client);

  const by = await personName(client, actor.id, 'Faculty');
  const facts = await bookingFacts(client, id);
  await notify(client, [{ userId: booking.created_by }], 'booking_approved', { ...facts.data, by },
    { actorId: actor.id, entityType: 'booking', entityId: id });
  for (const other of overlapping) {
    const f = await bookingFacts(client, other.id);
    await notify(client, [{ userId: other.created_by }], 'booking_rejected', { ...f.data, by: `${by} (the room was given to another request)` },
      { actorId: actor.id, entityType: 'booking', entityId: other.id });
  }

  return { data: approved, status: 200 };
};

export const rejectBooking = async (id, actor, isAdmin) => {
  return inTransaction(async (client) => {
    const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
    if (!booking) return { error: 'Booking not found', status: 404 };
    if (!isAdmin && (actor.faculty_id == null || booking.faculty_id !== actor.faculty_id)) return { error: 'Not authorized', status: 403 };
    if (booking.status !== 'PENDING') return { error: 'Booking is not pending', status: 400 };
    await bookingRepository.updateStatus(id, 'REJECTED', client);
    await logActivity({
      userId: actor.id,
      action: 'REJECT_BOOKING',
      entityType: 'booking',
      entityId: id,
      details: { rejected_by: isAdmin ? 'ADMIN' : 'FACULTY' },
    }, client);
    const facts = await bookingFacts(client, id);
    await notify(client, [{ userId: booking.created_by }], 'booking_rejected',
      { ...facts.data, by: await personName(client, actor.id, 'Faculty') }, { actorId: actor.id, entityType: 'booking', entityId: id });
    return { status: 200 };
  });
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Admin quick-book: book an existing room for a user on a date and hour. The room must exist
 * (no rooms are created from typos) and the target user must be an active account.
 */
export const quickBookHandler = async (reqData, user) => {
  const { room_name, target_user_id, date, slot, purpose } = reqData;
  const hours = reqData.hours === undefined ? 1 : Number(reqData.hours);
  if (!Number.isInteger(hours) || hours < 1) return { error: 'hours must be a whole number of hours', status: 400 };
  if (!room_name || !date || slot === undefined) {
    return { error: 'Missing required fields: room_name, date, slot', status: 400 };
  }
  if (!DATE_ONLY.test(String(date))) return { error: 'date must be YYYY-MM-DD', status: 400 };
  const hour = Number(slot);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { error: 'slot must be an hour between 0 and 23', status: 400 };

  const result = await inTransaction(async (client) => {
    const room = await roomRepository.findByName(room_name, client);
    if (!room) return { error: `Room ${room_name} not found`, status: 404 };

    let owner = user;
    if (target_user_id && String(target_user_id) !== String(user.id)) {
      const { rows: [target] } = await client.query(
        `SELECT u.id, u.role, u.name, f.id AS faculty_id FROM users u
           LEFT JOIN faculties f ON f.user_id = u.id AND f.is_active
          WHERE u.id = $1 AND u.is_active`,
        [target_user_id],
      );
      if (!target) return { error: 'Target user not found', status: 400 };
      owner = target;
    }

    if (!isDateKey(String(date))) {
      return { error: 'date is not a real calendar date', status: 400 };
    }
    const start = istDateTimeToUtc(String(date), hour);
    const end = new Date(new Date(start).getTime() + hours * 3600000).toISOString();
    return createBooking(client, {
      room_id: room.id, start_time: start, end_time: end, purpose: purpose || 'Admin Quick Booking',
    }, owner, user, { requireFaculty: false });
  });
  if (result.error) return result;

  invalidateRoomCaches();
  logger.info('Admin Quick Booking created', { booking_id: result.data.id, room_name, start_time: result.data.start_time });
  return { data: result.data, status: 201 };
};

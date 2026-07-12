import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { notifyFacultyNewRequest, notifyBookingCancelled } from '../utils/emailService.js';
import { logActivity } from './loggerService.js';
import { getHourFromTime } from '../utils/timetableLogic.js';
import { getIstParts, istDateTimeToUtc } from '../utils/timezone.js';

/**
 * Fetch bookings with optional filters
 */
export const getBookings = async (filters) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
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

const getTimetableDepartment = (dept) => {
  const normalized = String(dept || '').trim().toUpperCase();
  const mapping = {
    IT: 'INFORMATION TECHNOLOGY',
    CS: 'COMPUTER SCIENCE AND ENGINEERING',
    ICE: 'INSTRUMENTATION AND CONTROL ENGINEERING',
    ECE: 'ELECTRONICS AND COMMUNICATION ENGINEERING',
    ME: 'MECHANICAL ENGINEERING',
    MPAE: 'MANUFACTURING PROCESS AND AUTOMATION ENGINEERING',
    EE: 'ELECTRICAL ENGINEERING',
    BT: 'BIOTECHNOLOGY'
  };

  return mapping[normalized] || dept || null;
};

const normalizeHour = (hour) => {
  const parsedHour = Number(hour);
  if (Number.isNaN(parsedHour)) return 0;
  return parsedHour >= 1 && parsedHour < 8 ? parsedHour + 12 : parsedHour;
};

const hasTimetableOverlap = (slotTime, bookingStartHour, bookingEndHour) => {
  if (!slotTime) return false;
  
  const parts = slotTime.split('-').map(p => p.trim());
  if (parts.length < 2) return false;
  
  const [startStr, endStr] = parts;
  const slotStartHour = getHourFromTime(startStr);
  const slotEndHour = getHourFromTime(endStr);
  
  return bookingStartHour < slotEndHour && slotStartHour < bookingEndHour;
};

const checkTimetableClash = async (client, requester, reqData, userId) => {
  const { start_time, end_time, faculty_id } = reqData;
  if (!start_time || !end_time) return null;

  const requesterRole = (requester?.role || '').toUpperCase();
  // Admins may book outside a student section timetable, but a booking that
  // names a faculty member must never overlap that faculty member's timetable.
  if (requesterRole === 'ADMIN' && !faculty_id) return null;

  const startParts = getIstParts(start_time);
  const endParts = getIstParts(end_time);
  const dayName = startParts.day;
  const bookingHourCandidates = [{ start: normalizeHour(startParts.hour), end: normalizeHour(endParts.hour) }];

  const clashes = [];

  const checkFacultySchedule = async (facultyName, label) => {
    const facultyRows = await client.query(`
      SELECT slot_time, subject_name, faculty_name, room_name
      FROM timetable_slots
      WHERE UPPER(faculty_name) = $1 AND day_of_week = $2
    `, [facultyName.toUpperCase(), dayName]);

    const facultyFacultyRows = await client.query(`
      SELECT slot_time, content AS subject_name, faculty_name
      FROM faculty_timetable_slots
      WHERE is_occupied = true AND UPPER(faculty_name) = $1 AND day_of_week = $2
    `, [facultyName.toUpperCase(), dayName]);

    const combinedRows = [...facultyRows.rows, ...facultyFacultyRows.rows];
    const matched = combinedRows.filter((slot) => {
      return bookingHourCandidates.some((candidate) => {
        return hasTimetableOverlap(slot.slot_time, candidate.start, candidate.end);
      });
    });

    if (matched.length > 0) {
      clashes.push({
        type: 'timetable',
        label,
        subject: matched[0].subject_name || 'Scheduled class',
        faculty: matched[0].faculty_name || 'Unknown',
        room: matched[0].room_name || null,
        day: dayName,
        time: matched[0].slot_time || 'Unknown time'
      });
    }
  };

  if (requesterRole === 'FACULTY' || requesterRole === 'FACULTY MEMBER') {
    await checkFacultySchedule(requester.name, 'your timetable');
  } else {
    const department = getTimetableDepartment(requester.branch || requester.department_name);
    const semester = requester.semester || (requester.year ? requester.year * 2 : null);
    const section = requester.section;

    if (department && semester && section !== undefined && section !== null) {
      const sectionRows = await client.query(`
        SELECT slot_time, subject_name, faculty_name, room_name, department, semester, section
        FROM timetable_slots
        WHERE (UPPER(department) = $1 OR UPPER(department) = $2)
          AND semester::TEXT = $3::TEXT
          AND section::TEXT = $4::TEXT
          AND day_of_week = $5
      `, [department.toUpperCase(), (department || '').toUpperCase(), String(semester), String(section), dayName]);

      const matched = sectionRows.rows.filter((slot) => {
        return bookingHourCandidates.some((candidate) => {
          return hasTimetableOverlap(slot.slot_time, candidate.start, candidate.end);
        });
      });
      if (matched.length > 0) {
        clashes.push({
          type: 'timetable',
          label: 'your section timetable',
          subject: matched[0].subject_name || 'Scheduled class',
          faculty: matched[0].faculty_name || 'Unknown',
          room: matched[0].room_name || null,
          day: dayName,
          time: matched[0].slot_time || 'Unknown time'
        });
      }
    }
  }

  if (faculty_id) {
    const targetFaculty = await userRepository.findById(faculty_id, client);
    if (targetFaculty?.name) {
      await checkFacultySchedule(targetFaculty.name, 'the selected faculty timetable');
    }
  }

  return clashes.length > 0 ? clashes[0] : null;
};

/**
 * Handles the logic for creating a single booking
 */
export const createBooking = async (client, reqData, userId, requester = null) => {
  const { room_id, start_time, end_time, purpose, faculty_id } = reqData;

  const requesterProfile = requester?.id
    ? await userRepository.findById(requester.id, client)
    : await userRepository.findById(userId, client);

  const room = await roomRepository.findById(room_id, client);
  if (!room) {
    return { error: 'Room not found', status: 404 };
  }

  // Restrict student access
  const isStudent = requesterProfile?.role !== 'ADMIN' && requesterProfile?.role !== 'FACULTY';
  if (isStudent && room.student_access === false) {
    logger.info('Permission Denied: Student cannot book room', { room_id, user_id: userId });
    return { error: 'Students do not have permission to book this room', status: 403 };
  }

  const timetableClash = await checkTimetableClash(client, requesterProfile, reqData, userId);
  if (timetableClash) {
    logger.info('Conflict: Timetable clash', { room_id, start_time, user_id: userId, clash: timetableClash });
    const isSelectedFacultyBusy = timetableClash.label === 'the selected faculty timetable';
    return {
      error: isSelectedFacultyBusy
        ? 'The selected faculty member is busy during this slot.'
        : `This booking clashes with an existing timetable slot in ${timetableClash.label}`,
      status: 409,
      conflict: isSelectedFacultyBusy
        ? { type: 'faculty_busy' }
        : timetableClash
    };
  }

  // Check Room conflict
  const roomConflicts = await bookingRepository.checkRoomConflict(room_id, start_time, end_time, client);
  if (roomConflicts.length > 0) {
    logger.info('Conflict: Room occupied', { room_id, start_time, user_id: userId });
    return { error: 'Room is already booked for this time period (or pending approval)', status: 409 };
  }

  // Check User conflict
  const userConflicts = await bookingRepository.checkUserConflict(userId, start_time, end_time, client);
  if (userConflicts.length > 0) {
    logger.info('Conflict: User busy', { user_id: userId, start_time });
    return { 
      error: `You already have another booking during this time in Room ${userConflicts[0].room_name}`, 
      status: 409 
    };
  }

  // If faculty_id is provided, the booking starts as PENDING until approved.
  const status = faculty_id ? 'PENDING' : 'ACTIVE';

  const booking = await bookingRepository.create({
    room_id, start_time, end_time, created_by: userId, purpose, faculty_id, status
  }, client);
  
  await logActivity({
    userId,
    action: status === 'PENDING' ? 'REQUEST_BOOKING' : 'CREATE_BOOKING',
    entityType: 'booking',
    entityId: booking.id,
    details: { room_id, start_time, end_time, purpose }
  }, client);
  
  // Reschedule Logic
  const { reschedule_room_name } = reqData;
  if (reschedule_room_name) {
    await handleRescheduleFreedUpRoom(client, reqData, start_time);
  }

  return { data: booking, status: 201 };
};

const handleRescheduleFreedUpRoom = async (client, reqData, start_time) => {
  const { reschedule_room_name, reschedule_day, reschedule_hour } = reqData;
  
  let resRoom = await roomRepository.findByName(reschedule_room_name, client);
  let resRoomId;
  
  if (!resRoom) {
    throw { error: `Room ${reschedule_room_name} not found`, status: 404 };
  }
  resRoomId = resRoom.id;

  let dayName, hour;
  if (reschedule_day && reschedule_hour !== undefined) {
    dayName = reschedule_day;
    hour = parseInt(reschedule_hour);
  } else {
    const parts = getIstParts(start_time);
    dayName = parts.day;
    hour = parts.hour;
  }

  await roomRepository.upsertAvailability(resRoomId, dayName, hour, true, client);
  logger.info('Reschedule: Freed up room', { reschedule_room_name, dayName, hour });
};

/**
 * Cancel a booking
 */
export const cancelBooking = async (client, bookingId, userId, isAdmin) => {
  const booking = await bookingRepository.findById(bookingId, client);

  if (!booking) return { error: 'Booking not found', status: 404 };
  const isCreator = String(booking.created_by) === String(userId);
  const isAssignedFaculty = String(booking.faculty_id) === String(userId);
  
  if (!isCreator && !isAssignedFaculty && !isAdmin) return { error: 'Not authorized', status: 403 };

  await bookingRepository.updateStatus(bookingId, 'CANCELLED', client);

  await logActivity({
    userId,
    action: 'CANCEL_BOOKING',
    entityType: 'booking',
    entityId: bookingId,
    details: { reason: 'User/Admin initiated cancellation', previous_status: booking.status }
  }, client);

  return { status: 200 };
};

/**
 * Reschedule a booking (Legacy/Manual)
 */
export const rescheduleBooking = async (client, bookingId, data, userId) => {
  const { start_time, end_time, room_id } = data;
  const booking = await bookingRepository.findById(bookingId, client);

  if (!booking) return { error: 'Booking not found', status: 404 };
  if (booking.created_by !== userId) return { error: 'Not authorized', status: 403 };

  const newStartTime = start_time || booking.start_time;
  const newEndTime = end_time || booking.end_time;

  // Weekend check for students (rescheduling is only allowed for STUDENT_REP, so user is always student)
  const startTimeObj = new Date(newStartTime);
  const dayOfWeek = startTimeObj.getDay(); // 0 is Sunday, 6 is Saturday
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { error: 'Students are not allowed to book rooms on weekends', status: 400 };
  }

  const newRoomId = room_id || booking.room_id;

  // Check Room conflict (excluding the current booking itself)
  const roomConflicts = await bookingRepository.checkRoomConflict(newRoomId, newStartTime, newEndTime, client);
  const otherRoomConflicts = roomConflicts.filter(c => String(c.id) !== String(bookingId));
  if (otherRoomConflicts.length > 0) {
    return { error: 'Room is already booked for this time period', status: 409 };
  }

  // Check User conflict (excluding the current booking itself)
  const userConflicts = await bookingRepository.checkUserConflict(userId, newStartTime, newEndTime, client);
  const otherUserConflicts = userConflicts.filter(c => String(c.id) !== String(bookingId));
  if (otherUserConflicts.length > 0) {
    return { 
      error: `You already have another booking during this time in Room ${otherUserConflicts[0].room_name}`, 
      status: 409 
    };
  }

  await bookingRepository.createHistory({
    booking_id: bookingId,
    previous_start_time: booking.start_time,
    previous_end_time: booking.end_time,
    previous_room_id: booking.room_id,
    modified_by: userId,
    change_type: 'RESCHEDULE'
  }, client);

  const updatedBooking = await bookingRepository.updateBooking(bookingId, {
    start_time: newStartTime,
    end_time: newEndTime,
    room_id: newRoomId
  }, client);

  await logActivity({
    userId,
    action: 'RESCHEDULE_BOOKING',
    entityType: 'booking',
    entityId: bookingId,
    details: { 
        old: { start_time: booking.start_time, room_id: booking.room_id },
        new: { start_time: newStartTime, room_id: newRoomId }
    }
  }, client);

  return { data: updatedBooking, status: 200 };
};

/**
 * Faculty Portal Queries
 */
export const getPendingFacultyRequests = async (facultyId) => {
  return bookingRepository.findPendingByFaculty(facultyId);
};

export const approveBooking = async (client, id, facultyId, isAdmin) => {
  const booking = await bookingRepository.findById(id, client);
  
  if (!booking) return { error: 'Booking not found', status: 404 };
  if (!isAdmin && booking.faculty_id !== facultyId) return { error: 'Not authorized', status: 403 };
  if (booking.status !== 'PENDING') return { error: 'Booking is not pending', status: 400 };

  // Conflict check
  const conflicts = await bookingRepository.checkRoomConflict(booking.room_id, booking.start_time, booking.end_time, client);
  if (conflicts.length > 0) return { error: 'Room already booked', status: 409 };

  const approvedBooking = await bookingRepository.updateStatus(id, 'ACTIVE', client);

  await logActivity({
    userId: isAdmin ? -1 : facultyId, // System/Admin or Faculty
    action: 'APPROVE_BOOKING',
    entityType: 'booking',
    entityId: id,
    details: { approved_by: isAdmin ? 'ADMIN' : 'FACULTY' }
  }, client);

  // Reject others
  await bookingRepository.rejectConflicts(booking.room_id, id, booking.start_time, booking.end_time, client);

  return { data: approvedBooking, status: 200 };
};

export const rejectBooking = async (id, facultyId, isAdmin) => {
  const booking = await bookingRepository.findById(id);
  if (!booking) return { error: 'Booking not found', status: 404 };
  if (!isAdmin && booking.faculty_id !== facultyId) return { error: 'Not authorized', status: 403 };
  if (booking.status !== 'PENDING') return { error: 'Booking is not pending', status: 400 };

  const rejectedBooking = await bookingRepository.updateStatus(id, 'REJECTED');
  return { status: 200 };
};

export const createBookingHandler = async (reqData, user) => {
  const { start_time } = reqData;
  const userId = user.id;
  const startTimeObj = new Date(start_time);
  const startParts = getIstParts(start_time);
  const now = new Date();

  // Weekend check for students (roles other than ADMIN and FACULTY)
  if ((startParts.day === 'Sun' || startParts.day === 'Sat') && user.role !== 'ADMIN' && user.role !== 'FACULTY') {
    return { error: 'Students are not allowed to book rooms on weekends', status: 400 };
  }

  if (startTimeObj.getTime() + 3600000 < now.getTime()) {
    return { error: 'Cannot book in the past', status: 400 };
  }
  
  const daysDiff = Math.abs(startTimeObj - new Date()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 7 && user.role !== 'ADMIN') {
    return { error: 'Regular bookings allowed only for the current week', status: 400 };
  }

  // Enforce room type restriction
  const room = await roomRepository.findById(reqData.room_id);
  if (!room) {
    return { error: 'Room not found', status: 404 };
  }
  if ((room.type === 'Committee Room' || room.type === 'Auditorium') && user.role !== 'ADMIN' && user.role !== 'FACULTY') {
    return { error: 'Committee Rooms and Auditoriums can only be booked by Faculty or Admin', status: 403 };
  }

  const result = await db.runInTransaction(async (client) => {
    const res = await createBooking(client, reqData, userId, user);
    if (res.error) throw res;
    return res;
  }).catch(err => {
    if (err && err.error) return err;
    throw err;
  });

  if (result.error) return result;

  cache.deletePattern('admin_status_.*');
  cache.delete('room_availability_all');
  logger.info('Booking created', { booking_id: result.data.id, user_id: userId, room_id: reqData.room_id, start_time });

  // PROD-02: Notify faculty of new pending request
  if (reqData.faculty_id && result.data) {
    try {
      const faculty = await userRepository.findById(reqData.faculty_id);
      const student = await userRepository.findById(userId);
      const room = await roomRepository.findById(reqData.room_id);
      if (faculty?.email) {
        const dateStr = new Date(start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const hour = new Date(start_time).getHours();
        notifyFacultyNewRequest({
          facultyName: faculty.name,
          facultyEmail: faculty.email,
          studentName: student?.name || 'A student',
          roomName: room?.name || reqData.room_id,
          date: dateStr,
          time: `${hour}:00 – ${hour + 1}:00`
        }).catch(err => logger.error('Faculty notification failed', err));
      }
    } catch (notifErr) {
      logger.error('Failed to send faculty notification (non-blocking)', notifErr);
    }
  }

  return result;
};

export const cancelBookingHandler = async (bookingId, user) => {
  const userId = user.id;
  const isAdmin = user.role === 'ADMIN';
  
  const result = await db.runInTransaction(async (client) => {
    const res = await cancelBooking(client, bookingId, userId, isAdmin);
    if (res.error) throw res;
    return res;
  }).catch(err => {
    if (err && err.error) return err;
    throw err;
  });

  if (result.error) return result;

  cache.deletePattern('admin_status_.*');
  cache.delete('room_availability_all');
  logger.info('Booking cancelled', { booking_id: bookingId, user_id: userId });

  // PROD-02: Notify booking creator about cancellation
  try {
    const booking = await bookingRepository.findById(bookingId);
    if (booking) {
      const creator = await userRepository.findById(booking.created_by);
      const room = await roomRepository.findById(booking.room_id);
      if (creator?.email) {
        const dateStr = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const hour = new Date(booking.start_time).getHours();
        const canceller = userId !== booking.created_by ? (await userRepository.findById(userId))?.name : null;
        notifyBookingCancelled({
          userEmail: creator.email,
          userName: creator.name,
          roomName: room?.name || booking.room_id,
          date: dateStr,
          time: `${hour}:00 – ${hour + 1}:00`,
          cancelledBy: canceller || undefined
        }).catch(err => logger.error('Cancellation notification failed', err));
      }
    }
  } catch (notifErr) {
    logger.error('Failed to send cancellation notification (non-blocking)', notifErr);
  }

  return result;
};

export const rescheduleBookingHandler = async (bookingId, reqData, user) => {
  const userId = user.id;
  
  const booking = await bookingRepository.findById(bookingId);
  if (!booking) return { error: 'Booking not found', status: 404 };

  const targetRoomId = reqData.room_id || booking.room_id;
  const targetRoom = await roomRepository.findById(targetRoomId);
  if (!targetRoom) return { error: 'Target room not found', status: 404 };

  if ((targetRoom.type === 'Committee Room' || targetRoom.type === 'Auditorium') && user.role !== 'ADMIN' && user.role !== 'FACULTY') {
    return { error: 'Committee Rooms and Auditoriums can only be booked by Faculty or Admin', status: 403 };
  }

  const result = await db.runInTransaction(async (client) => {
    const res = await rescheduleBooking(client, bookingId, reqData, userId);
    if (res.error) throw res;
    return res;
  }).catch(err => {
    if (err && err.error) return err;
    throw err;
  });

  if (result.error) return result;

  cache.deletePattern('admin_status_.*');
  cache.delete('room_availability_all');
  return result;
};

export const quickBookHandler = async (reqData, user) => {
  const { room_name, target_user_id, date, slot, purpose } = reqData;
  const adminId = user.id;

  if (!room_name || !date || slot === undefined) {
    return { error: 'Missing required fields: room_name, date, slot', status: 400 };
  }

  const userId = target_user_id || adminId;
  
  const result = await db.runInTransaction(async (client) => {
    let room = await roomRepository.findByName(room_name, client);
    let roomId;
    if (!room) {
      const safeName = String(room_name).trim();
      const firstDigit = safeName.charAt(0);
      const building = /^\d$/.test(firstDigit) ? `${firstDigit}th Block` : 'Unknown';
      const floor = safeName.length >= 2 ? parseInt(safeName.charAt(1)) || 0 : 0;

      room = await roomRepository.create({
        name: safeName, building, floor, capacity: 40
      }, client);
      roomId = room.id;
    } else {
      roomId = room.id;
    }

    const startTime = new Date(istDateTimeToUtc(date, parseInt(slot)));
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const res = await createBooking(client, { 
      room_id: roomId, 
      start_time: startTime.toISOString(), 
      end_time: endTime.toISOString(), 
      purpose: purpose || 'Admin Quick Booking' 
    }, userId, user);

    if (res.error) throw res;
    return { res, startTime };
  }).catch(err => {
    if (err && err.error) return err;
    throw err;
  });

  if (result.error) return result;

  cache.deletePattern('admin_status_.*');
  cache.delete('room_availability_all');
  logger.info('Admin Quick Booking created', { booking_id: result.res.data.id, room_name, start_time: result.startTime });
  return result.res;
};

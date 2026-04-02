import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { notifyFacultyNewRequest, notifyBookingCancelled } from '../utils/emailService.js';
import { logActivity } from './loggerService.js';

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

/**
 * Handles the logic for creating a single booking
 */
export const createBooking = async (client, reqData, userId) => {
  const { room_id, start_time, end_time, purpose, faculty_id } = reqData;

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
    const dateObj = new Date(start_time);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayName = days[dateObj.getDay()];
    hour = dateObj.getHours();
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
  if (booking.created_by !== userId && !isAdmin) return { error: 'Not authorized', status: 403 };

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
  const now = new Date();
  if (startTimeObj.getTime() + 3600000 < now.getTime()) {
    return { error: 'Cannot book in the past', status: 400 };
  }
  
  const daysDiff = Math.abs(startTimeObj - new Date()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 7 && user.role !== 'ADMIN') {
    return { error: 'Regular bookings allowed only for the current week', status: 400 };
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await createBooking(client, reqData, userId);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return result;
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*'); 
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
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const cancelBookingHandler = async (bookingId, user) => {
  const userId = user.id;
  const isAdmin = user.role === 'ADMIN';
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await cancelBooking(client, bookingId, userId, isAdmin);

    if (result.error) {
      await client.query('ROLLBACK');
      return result;
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*'); 
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
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const rescheduleBookingHandler = async (bookingId, reqData, user) => {
  const userId = user.id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await rescheduleBooking(client, bookingId, reqData, userId);
    
    if (result.error) {
      await client.query('ROLLBACK');
      return result;
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const quickBookHandler = async (reqData, user) => {
  const { room_name, target_user_id, date, slot, purpose } = reqData;
  const adminId = user.id;

  if (!room_name || !date || slot === undefined) {
    return { error: 'Missing required fields: room_name, date, slot', status: 400 };
  }

  const userId = target_user_id || adminId;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

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

    const startTime = new Date(date);
    startTime.setHours(parseInt(slot), 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    const result = await createBooking(client, { 
      room_id: roomId, 
      start_time: startTime.toISOString(), 
      end_time: endTime.toISOString(), 
      purpose: purpose || 'Admin Quick Booking' 
    }, userId);

    if (result.error) {
      await client.query('ROLLBACK');
      return result;
    }

    await client.query('COMMIT');
    cache.deletePattern('admin_status_.*');
    logger.info('Admin Quick Booking created', { booking_id: result.data.id, room_name, start_time: startTime });
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

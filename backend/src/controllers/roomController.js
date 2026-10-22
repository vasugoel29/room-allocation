import { sendServerError } from '../utils/httpErrors.js';
import * as db from '../db.js';
import cache, { invalidateRoomCaches } from '../utils/cache.js';
import { roomRepository } from '../repositories/roomRepository.js';
import { timetableRepository } from '../repositories/timetableRepository.js';
import logger from '../utils/logger.js';
import { getIstParts, istDateTimeToUtc } from '../utils/timezone.js';
import { canBookDirect } from '../auth/permissions.js';

const STUDENT_HIDDEN_TYPES = ['Committee Room', 'Auditorium'];

export const getRooms = async (req, res) => {
  const { capacity, ac, projector, building, floor, type, page, limit } = req.query;
  try {
    // Restricted rooms are only listed for people who may book them (cras.bookings.direct).
    const isStudent = !canBookDirect(req.user);
    
    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const offset = (pageNum - 1) * limitNum;
      
      // Hidden room types are excluded in SQL so the page and its total agree (NEW-RTT-1).
      const { total, rooms } = await roomRepository.findFilteredPaginated({
        capacity, ac, projector, building, floor, type, limit: limitNum, offset,
        excludeTypes: isStudent ? STUDENT_HIDDEN_TYPES : [],
      });

      res.json({
        data: rooms,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } else {
      let rooms = await roomRepository.findFiltered(capacity, ac, projector, building, floor, type);
      if (isStudent) {
        rooms = rooms.filter(r => !STUDENT_HIDDEN_TYPES.includes(r.type));
      }
      res.json(rooms);
    }
  } catch (err) {
    logger.error('getRooms error', err);
    sendServerError(res, err, 'Failed to fetch rooms');
  }
};

export const getAvailability = async (req, res) => {
  try {
    const cacheKey = 'room_availability_all';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await roomRepository.getAllAvailability();
    cache.set(cacheKey, result, 300000); // 5 min
    res.json(result);
  } catch (err) {
    logger.error('getAvailability error', err);
    sendServerError(res, err, 'Failed to fetch availability');
  }
};

export const getAdminRoomStatus = async (req, res) => {
  const { date, slot } = req.query;
  if (!date || slot === undefined) {
    return res.status(400).json({ error: 'Missing date or slot' });
  }

  try {
    const cacheKey = `admin_status_${date}_${slot}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const startTime = new Date(istDateTimeToUtc(date, parseInt(slot)));
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

    const statuses = await roomRepository.getAdminRoomStatus(startTime.toISOString(), endTime.toISOString());
    
    cache.set(cacheKey, statuses, 30000); // 30s cache
    res.json(statuses);
  } catch (err) {
    logger.error('getAdminRoomStatus error', err);
    sendServerError(res, err, 'Failed to fetch room statuses');
  }
};
export const overrideRoomAvailability = async (req, res) => {
  const { room_name, day, hour, is_available } = req.body;
  if (!room_name || !day || hour === undefined || is_available === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const userId = req.user?.id; // Capture who is making the override
    await roomRepository.overrideAvailability(room_name, day, hour, is_available, userId);
    
    invalidateRoomCaches();
    res.json({ status: 'Success', message: `Room ${room_name} availability updated` });
  } catch (err) {
    if (err.message === 'Room not found') return res.status(404).json({ error: 'Room not found' });
    sendServerError(res, err, 'Failed to update availability');
  }
};

export const getMyOverrides = async (req, res) => {
  try {
    const overrides = await roomRepository.getUserOverrides(req.user.id);
    res.json(overrides);
  } catch (err) {
    logger.error('getMyOverrides error', err);
    sendServerError(res, err, 'Failed to fetch your overrides');
  }
};

export const createRoom = async (req, res) => {
  const { name, building, floor, capacity, type, has_ac, has_projector, description, student_access } = req.body;
  if (!name || capacity === undefined) {
    return res.status(400).json({ error: 'Missing name or capacity' });
  }

  try {
    const room = await roomRepository.create({
      name,
      building,
      floor: floor !== undefined && floor !== null ? parseInt(floor) : null,
      capacity: parseInt(capacity),
      type,
      has_ac: !!has_ac,
      has_projector: !!has_projector,
      description,
      student_access: student_access !== undefined ? student_access : true
    });
    invalidateRoomCaches();
    res.status(201).json(room);
  } catch (err) {
    logger.error('createRoom error', err);
    sendServerError(res, err, 'Failed to create room');
  }
};

export const updateRoom = async (req, res) => {
  const { id } = req.params;
  const { name, building, floor, capacity, type, has_ac, has_projector, description, student_access } = req.body;

  try {
    // Only fields present in the request change; capacity/floor must be valid numbers.
    const patch = { name, building, type, description, student_access };
    if (floor !== undefined) patch.floor = floor === null || floor === '' ? null : Number(floor);
    if (capacity !== undefined) patch.capacity = Number(capacity);
    if (has_ac !== undefined) patch.has_ac = !!has_ac;
    if (has_projector !== undefined) patch.has_projector = !!has_projector;
    if (patch.capacity !== undefined && (!Number.isInteger(patch.capacity) || patch.capacity < 1)) {
      return res.status(400).json({ error: 'capacity must be a positive whole number' });
    }
    if (patch.floor !== undefined && patch.floor !== null && !Number.isInteger(patch.floor)) {
      return res.status(400).json({ error: 'floor must be a whole number' });
    }
    if (patch.name !== undefined && (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 32)) {
      return res.status(400).json({ error: 'name must be 1–32 characters' });
    }
    const room = await roomRepository.update(id, patch);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    invalidateRoomCaches();
    res.json(room);
  } catch (err) {
    logger.error('updateRoom error', err);
    sendServerError(res, err, 'Failed to update room');
  }
};

export const deleteRoom = async (req, res) => {
  const { id } = req.params;
  try {
    const room = await db.runInTransaction((client) => roomRepository.delete(id, client));
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    invalidateRoomCaches();
    res.json({ status: 'Success', message: `Room ${room.name} deleted successfully` });
  } catch (err) {
    logger.error('deleteRoom error', err);
    sendServerError(res, err, 'Failed to delete room');
  }
};

// ─── Room Week Schedule (Room Grid view) ─────────────────────────────────────

/**
 * GET /rooms/:id/week-schedule?weekStart=YYYY-MM-DD
 * Returns timetable blocks + bookings for a room for one week.
 * weekStart must be a Monday.
 */
export const getRoomWeekSchedule = async (req, res) => {
  const { id } = req.params;
  const { weekStart } = req.query;

  if (!weekStart) return res.status(400).json({ error: 'weekStart (YYYY-MM-DD) is required' });

  try {
    // weekStart is a campus-local calendar date. Query the full IST week.
    const start = new Date(istDateTimeToUtc(weekStart, 0));
    const end = new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000) - 1);

    const [roomResult, classes, blocks, bookingsResult] = await Promise.all([
      // Room details
      db.query('SELECT id, name, floor, building, capacity, type, has_ac, has_projector FROM rooms WHERE id = $1', [id]),
      // Weekly classes in this room (section timetables and faculty slots, by room id)
      timetableRepository.roomClasses(id),
      // Admin weekly blocks
      db.query('SELECT day, hour FROM room_availability WHERE room_id = $1 AND is_active ORDER BY day, hour', [id]),

      // Active bookings within this week
      db.query(`
        SELECT b.id, b.start_time, b.end_time, b.purpose, b.status,
               u.name AS booker_name, u.email AS booker_email, u.role AS booker_role
        FROM bookings b
        JOIN users u ON b.created_by = u.id
        WHERE b.room_id = $1
          AND b.status = 'ACTIVE'
          AND b.start_time <= $3::timestamptz
          AND b.end_time   >= $2::timestamptz
        ORDER BY b.start_time
      `, [id, start.toISOString(), end.toISOString()])
    ]);

    if (!roomResult.rows[0]) return res.status(404).json({ error: 'Room not found' });

    // One block per taken hour: classes carry their detail, admin blocks none.
    const timetableBlocks = [];
    const seen = new Set();
    for (const c of classes) {
      for (let h = Math.floor(c.start_min / 60); h * 60 < c.end_min; h++) {
        if (seen.has(`${c.day_of_week}|${h}`)) continue;
        seen.add(`${c.day_of_week}|${h}`);
        timetableBlocks.push({
          day: c.day_of_week, hour: h, faculty: c.faculty_name, subject: c.subject_name, semester: c.semester,
          // A class comes from a timetable (it is cancelled per date, not lifted); only faculty slots have an editable id.
          source: 'class', slotId: c.kind === 'faculty' ? c.id : null,
        });
      }
    }
    for (const b of blocks.rows) {
      if (!seen.has(`${b.day}|${b.hour}`)) timetableBlocks.push({ day: b.day, hour: b.hour, source: 'block' }); // admin weekly block: can be lifted
    }

    // Normalise bookings to {date, startHour, endHour, ...}
    const bookings = bookingsResult.rows.map(b => {
      const st = getIstParts(b.start_time);
      const et = getIstParts(b.end_time);
      return {
        id: b.id,
        date: st.date,
        startHour: st.hour,
        endHour: et.hour,
        start_time: b.start_time.toISOString(),
        end_time: b.end_time.toISOString(),
        purpose: b.purpose,
        status: b.status,
        bookerName: b.booker_name,
        bookerEmail: b.booker_email,
        bookerRole: b.booker_role
      };
    });

    res.json({
      room: roomResult.rows[0],
      timetableBlocks,
      bookings
    });
  } catch (err) {
    logger.error('getRoomWeekSchedule error', err);
    sendServerError(res, err);
  }
};

/**
 * GET /rooms/:id/conflict-check?date=YYYY-MM-DD&startHour=9&endHour=10
 * Returns all conflicts for a proposed booking slot.
 * Returns { hasConflict, conflicts[] }
 */
export const checkRoomConflict = async (req, res) => {
  const { id } = req.params;
  const { date, startHour, endHour } = req.query;

  if (!date || startHour === undefined || endHour === undefined) {
    return res.status(400).json({ error: 'date, startHour, endHour are required' });
  }

  const sh = parseInt(startHour);
  const eh = parseInt(endHour);
  if (eh <= sh) return res.status(400).json({ error: 'endHour must be after startHour' });

    try {
      const d = new Date(date + 'T00:00:00Z');
      const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayName = DAY_NAMES[d.getUTCDay()];
      const dayShort = dayName.substring(0, 3);

      const conflicts = [];

      const hours = [];
      for (let h = sh; h < eh; h++) hours.push(h);

      // Classes and admin blocks in those hours, unless released for this date (the booking rule).
      const [classes, blocked] = await Promise.all([
        timetableRepository.roomClasses(id, dayShort),
        timetableRepository.blockedHours(id, dayShort),
      ]);
      for (const h of hours) {
        if (await timetableRepository.isReleased(id, date, h, h + 1)) continue;
        const cls = classes.find((c) => c.start_min < h * 60 + 60 && h * 60 < c.end_min);
        if (cls) {
          conflicts.push({
            type: 'timetable',
            hour: h,
            // Only faculty slots can be removed from the Room Grid; section classes come from the import.
            slotId: cls.kind === 'faculty' ? cls.id : null,
            faculty: cls.faculty_name || 'Unknown faculty',
            subject: cls.subject_name || 'Scheduled class',
            resolution: cls.kind === 'faculty'
              ? 'Remove the timetable slot for this room and hour first.'
              : 'A section class from the timetable import. An admin booking here cancels it for this date and notifies its teacher and students.',
          });
        } else if (blocked.includes(h)) {
          conflicts.push({ type: 'timetable', hour: h, slotId: null, faculty: null, subject: 'Blocked by an admin',
            resolution: 'Lift the weekly block for this room and hour first.' });
        }
      }

      // IST wall-clock window, independent of the server's time zone (BKG-13).
      const startTime = new Date(istDateTimeToUtc(date, sh));
      const endTime   = new Date(istDateTimeToUtc(date, eh));

      const bookingResult = await db.query(`
        SELECT b.id, b.start_time, b.end_time, b.purpose,
               u.name AS booker_name, u.email AS booker_email
        FROM bookings b
        JOIN users u ON b.created_by = u.id
        WHERE b.room_id = $1
          AND b.status = 'ACTIVE'
          AND tstzrange(b.start_time, b.end_time) && tstzrange($2::timestamptz, $3::timestamptz)
      `, [id, startTime.toISOString(), endTime.toISOString()]);

      for (const b of bookingResult.rows) {
        conflicts.push({
          type: 'booking',
          bookingId: b.id,
          booker: b.booker_name,
          bookerEmail: b.booker_email,
          purpose: b.purpose,
          startTime: b.start_time,
          endTime: b.end_time,
          resolution: `Cancel or reschedule booking #${b.id} by ${b.booker_name} first.`
        });
      }

      res.json({ hasConflict: conflicts.length > 0, conflicts });
  } catch (err) {
    logger.error('checkRoomConflict error', err);
    sendServerError(res, err);
  }
};

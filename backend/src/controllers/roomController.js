import * as db from '../db.js';
import cache from '../utils/cache.js';
import { roomRepository } from '../repositories/roomRepository.js';
import logger from '../utils/logger.js';
import { getIstParts, istDateTimeToUtc } from '../utils/timezone.js';

export const getRooms = async (req, res) => {
  const { capacity, ac, projector, building, floor, type, page, limit } = req.query;
  try {
    const isStudent = req.user?.role !== 'ADMIN' && req.user?.role !== 'FACULTY';
    
    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const offset = (pageNum - 1) * limitNum;
      
      let { total, rooms } = await roomRepository.findFilteredPaginated({
        capacity, ac, projector, building, floor, type, limit: limitNum, offset
      });
      
      if (isStudent) {
        rooms = rooms.filter(r => r.type !== 'Committee Room' && r.type !== 'Auditorium');
      }
      
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
        rooms = rooms.filter(r => r.type !== 'Committee Room' && r.type !== 'Auditorium');
      }
      res.json(rooms);
    }
  } catch (err) {
    logger.error('getRooms error', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

export const getAvailability = async (req, res) => {
  try {
    const cacheKey = 'room_availability_all';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const roomsRes = await db.query('SELECT id, name FROM rooms WHERE is_active = TRUE ORDER BY name ASC');
    const slotsRes = await db.query(`
      SELECT ts.room_id, ts.day_of_week, ts.start_time, ts.end_time 
      FROM timetable_slots ts
      WHERE ts.room_id IS NOT NULL
    `);

    const rooms = roomsRes.rows;
    const slots = slotsRes.rows;

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];

    const toTitleCaseDay = (d) => d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d;

    for (const r of rooms) {
      const roomSlots = slots.filter(s => s.room_id === r.id);
      for (const day of days) {
        for (let hour = 8; hour <= 20; hour++) {
          const isOccupied = roomSlots.some(s => {
            const sDay = toTitleCaseDay(s.day_of_week);
            if (sDay !== day) return false;
            
            const startHour = parseInt(s.start_time.split(':')[0]);
            const endHour = parseInt(s.end_time.split(':')[0]);
            return hour >= startHour && hour < endHour;
          });

          result.push({
            room_id: r.id,
            room_name: r.name,
            day,
            hour,
            is_available: !isOccupied
          });
        }
      }
    }

    cache.set(cacheKey, result, 300000); // 5 min
    res.json(result);
  } catch (err) {
    logger.error('getAvailability error', err);
    res.status(500).json({ error: 'Failed to fetch availability' });
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
    res.status(500).json({ error: 'Failed to fetch room statuses' });
  }
};
export const overrideRoomAvailability = async (req, res) => {
  res.json({ status: 'Success', message: 'Override processed (availability is now managed dynamically)' });
};

export const getMyOverrides = async (req, res) => {
  res.json([]);
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
    cache.delete('room_availability_all');
    res.status(201).json(room);
  } catch (err) {
    logger.error('createRoom error', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

export const updateRoom = async (req, res) => {
  const { id } = req.params;
  const { name, building, floor, capacity, type, has_ac, has_projector, description, student_access } = req.body;

  try {
    const room = await roomRepository.update(id, {
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
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    cache.delete('room_availability_all');
    res.json(room);
  } catch (err) {
    logger.error('updateRoom error', err);
    res.status(500).json({ error: 'Failed to update room' });
  }
};

export const deleteRoom = async (req, res) => {
  const { id } = req.params;
  try {
    const room = await roomRepository.delete(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    cache.delete('room_availability_all');
    res.json({ status: 'Success', message: `Room ${room.name} deleted successfully` });
  } catch (err) {
    logger.error('deleteRoom error', err);
    res.status(500).json({ error: 'Failed to delete room' });
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

    const [roomResult, ttResult, bookingsResult] = await Promise.all([
      db.query('SELECT id, name, floor, building, capacity, type, has_ac, has_projector FROM rooms WHERE id = $1', [id]),

      db.query(`
        SELECT 
          ts.day_of_week,
          ts.start_time,
          ts.end_time,
          u.name AS faculty_name,
          s.name AS subject_name,
          ts.semester
        FROM timetable_slots ts
        LEFT JOIN users u ON ts.faculty_id = u.id
        LEFT JOIN subjects s ON ts.subject_id = s.id
        WHERE ts.room_id = $1
      `, [id]),

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

    const toTitleCaseDay = (d) => d ? d.charAt(0).toUpperCase() + d.slice(1).toLowerCase() : d;
    const timetableBlocks = [];
    for (const s of ttResult.rows) {
      const day = toTitleCaseDay(s.day_of_week);
      const startHour = parseInt(s.start_time.split(':')[0]);
      const endHour = parseInt(s.end_time.split(':')[0]);
      for (let hour = startHour; hour < endHour; hour++) {
        timetableBlocks.push({
          day,
          hour,
          faculty: s.faculty_name || 'Unknown',
          subject: s.subject_name || 'Scheduled class',
          semester: s.semester
        });
      }
    }

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
    res.status(500).json({ error: err.message });
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

    try {
      const d = new Date(date + 'T00:00:00Z');
      const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const dayName = DAY_NAMES[d.getUTCDay()];
      const dayShort = dayName.substring(0, 3);

      const conflicts = [];

      const hours = [];
      for (let h = sh; h < eh; h++) hours.push(h);

      if (hours.length > 0) {
        const ttResult = await db.query(`
          SELECT 
            ts.id, 
            u.name AS faculty_name, 
            s.name AS content, 
            ts.start_time, 
            ts.end_time
          FROM timetable_slots ts
          LEFT JOIN users u ON ts.faculty_id = u.id
          LEFT JOIN subjects s ON ts.subject_id = s.id
          WHERE ts.room_id = $1 
            AND ts.day_of_week = $2
            AND NOT EXISTS (
              SELECT 1 FROM timetable_slot_overrides o
              WHERE o.timetable_slot_id = ts.id
                AND o.override_date = $3::DATE
                AND o.is_cancelled
            )
        `, [id, dayShort.toUpperCase(), date]);

        for (const s of ttResult.rows) {
          const startHour = parseInt(s.start_time.split(':')[0]);
          const endHour = parseInt(s.end_time.split(':')[0]);
          for (const h of hours) {
            if (h >= startHour && h < endHour) {
              conflicts.push({
                type: 'timetable',
                hour: h,
                slotId: s.id,
                faculty: s.faculty_name || 'Unknown faculty',
                subject: s.content || 'Scheduled class',
                resolution: 'Remove the timetable slot for this room and hour first.'
              });
            }
          }
        }
      }

      const [year, month, day] = date.split('-').map(Number);
      const startTime = new Date(year, month - 1, day, sh, 0, 0, 0);
      const endTime   = new Date(year, month - 1, day, eh, 0, 0, 0);

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
    res.status(500).json({ error: err.message });
  }
};

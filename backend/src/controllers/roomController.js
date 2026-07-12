import * as db from '../db.js';
import cache from '../utils/cache.js';
import { roomRepository } from '../repositories/roomRepository.js';
import logger from '../utils/logger.js';

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

    const result = await roomRepository.getAllAvailability();
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

    const startTime = new Date(date);
    startTime.setHours(parseInt(slot), 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    const statuses = await roomRepository.getAdminRoomStatus(startTime.toISOString(), endTime.toISOString());
    
    cache.set(cacheKey, statuses, 30000); // 30s cache
    res.json(statuses);
  } catch (err) {
    logger.error('getAdminRoomStatus error', err);
    res.status(500).json({ error: 'Failed to fetch room statuses' });
  }
};
export const overrideRoomAvailability = async (req, res) => {
  const { room_name, day, hour, is_available } = req.body;
  if (!room_name || !day || hour === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const userId = req.user?.id; // Capture who is making the override
    await roomRepository.overrideAvailability(room_name, day, hour, is_available, userId);
    
    cache.delete('room_availability_all');
    res.json({ status: 'Success', message: `Room ${room_name} availability updated` });
  } catch (err) {
    logger.error('overrideRoomAvailability error', err);
    res.status(500).json({ error: err.message || 'Failed to update availability' });
  }
};

export const getMyOverrides = async (req, res) => {
  try {
    const overrides = await roomRepository.getUserOverrides(req.user.id);
    res.json(overrides);
  } catch (err) {
    logger.error('getMyOverrides error', err);
    res.status(500).json({ error: 'Failed to fetch your overrides' });
  }
};

export const createRoom = async (req, res) => {
  const { name, building, floor, capacity, type, has_ac, has_projector } = req.body;
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
      has_projector: !!has_projector
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
  const { name, building, floor, capacity, type, has_ac, has_projector } = req.body;

  try {
    const room = await roomRepository.update(id, {
      name,
      building,
      floor: floor !== undefined && floor !== null ? parseInt(floor) : null,
      capacity: parseInt(capacity),
      type,
      has_ac: !!has_ac,
      has_projector: !!has_projector
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
    // Parse weekStart as LOCAL date, not UTC
    const start = new Date(weekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + 6); // Add 6 days locally
    end.setHours(23, 59, 59, 999);

    const [roomResult, availResult, ttResult, bookingsResult] = await Promise.all([
      // Room details
      db.query('SELECT id, name, floor, building, capacity, type, has_ac, has_projector FROM rooms WHERE id = $1', [id]),

      // Timetable blocks from room_availability (recurring weekly occupancy)
      db.query(`
        SELECT ra.day, ra.hour, ra.is_available
        FROM room_availability ra
        WHERE ra.room_id = $1 AND ra.is_available = FALSE
        ORDER BY ra.day, ra.hour
      `, [id]),

      // Rich detail from faculty_timetable_slots where room_id is set
      db.query(`
        SELECT day_of_week, slot_time, faculty_name, content, semester
        FROM faculty_timetable_slots
        WHERE room_id = $1
        ORDER BY day_of_week, slot_time
      `, [id]),

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

    // Build a lookup map: day → hour → timetable slot detail
    const ttMap = {};
    for (const row of ttResult.rows) {
      const key = `${row.day_of_week}`;
      if (!ttMap[key]) ttMap[key] = {};
      // parse start hour from slot_time like "09:00-10:00" or "T309:00-10:00"
      const match = row.slot_time.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        let hour = parseInt(match[1]);
        if (hour < 8) {
          hour += 12;
        }
        ttMap[key][hour] = { faculty: row.faculty_name, subject: row.content, semester: row.semester };
      }
    }

    // Enrich availability blocks with timetable detail
    const timetableBlocks = availResult.rows.map(row => ({
      day: row.day,
      hour: row.hour,
      ...(ttMap[row.day]?.[row.hour] || {})
    }));

    // Normalise bookings to {date, startHour, endHour, ...}
    const bookings = bookingsResult.rows.map(b => {
      const st = new Date(b.start_time);
      const et = new Date(b.end_time);
      const year = st.getFullYear();
      const month = String(st.getMonth() + 1).padStart(2, '0');
      const day = String(st.getDate()).padStart(2, '0');
      return {
        id: b.id,
        date: `${year}-${month}-${day}`,
        startHour: st.getHours(),
        endHour: et.getHours(),
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
        const availResult = await db.query(`
          SELECT ra.hour, ra.is_available
          FROM room_availability ra
          WHERE ra.room_id = $1 AND ra.day = $2 AND ra.hour = ANY($3) AND ra.is_available = FALSE
        `, [id, dayShort, hours]);

        if (availResult.rows.length > 0) {
          const ttResult = await db.query(`
            SELECT id, faculty_name, content, slot_time
            FROM faculty_timetable_slots
            WHERE room_id = $1 AND day_of_week = $2
          `, [id, dayShort]);

          for (const row of availResult.rows) {
            const detail = ttResult.rows.find(s => {
              const match = s.slot_time.match(/(\d{1,2}):(\d{2})/);
              if (match) {
                let h = parseInt(match[1]);
                if (h < 8) h += 12;
                return h === row.hour;
              }
              return false;
            });

            conflicts.push({
              type: 'timetable',
              hour: row.hour,
              slotId: detail?.id || null,
              faculty: detail?.faculty_name || 'Unknown faculty',
              subject: detail?.content || 'Scheduled class',
              resolution: 'Remove the timetable slot for this room and hour first.'
            });
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

/**
 * Utility for Timetable and Booking logic
 */
import { getIstDateKey, getIstHour, getIstTime } from './timezone';
import { getHourFromTime, getSortableMinutes, formatTo24h } from '../../../shared/timetable.js';
import { teaches } from '../utils/permissions';

/**
 * Gets the base 5-day week name (Mon, Tue, etc.) from a date string or Date object
 */
export const getDayOfWeek = (dateInput) => {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [year, month, day] = dateInput.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[d.getDay()];
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
};

// Timetable time rules live in /shared (the backend uses the same module).
export { getHourFromTime, getSortableMinutes, formatTo24h } from '../../../shared/timetable.js';

/**
 * Resolves the merged schedule for a specific user and date
 */
export const getMergedSchedule = (user, dateStr, bookings = [], availability = [], timetableData = [], facultyTimetableData = {}, facultyOverrides = []) => {
  if (!user) return [];
  
  const dayOfWeek = getDayOfWeek(dateStr);
  if (dayOfWeek === 'Sun' || dayOfWeek === 'Sat') return [];

  // 1. Static Base
  let staticClasses = [];
  
  if (teaches(user)) {
    // Faculty Logic
    const rawSlots = facultyTimetableData[dayOfWeek] || [];
    staticClasses = rawSlots.map(s => ({
      time: s.slot_time,
      subjectName: s.subject_name || s.content || 'Untitled Slot',
      room: s.room_name || 'N/A',
      faculty: s.faculty_name || '',
      className: s.department ? `${s.department} Sem ${s.semester}${s.section ? ` · Sec ${s.section}` : ''}` : (s.class_name || ''),
      isOccupied: true,
      isDynamic: false
    }));
  } else {
    // Student Logic: Flattened Array of Slots
    if (!Array.isArray(timetableData)) return [];

    staticClasses = timetableData
      .filter(slot => {
        const slotDay = (slot.day_of_week || '').substring(0, 3);
        return slotDay === dayOfWeek;
      })
      .map(slot => ({
        time: slot.slot_time,
        subjectName: slot.subject_name,
        room: slot.room_name,
        faculty: slot.faculty_name || '',
        className: slot.department ? `${slot.department} Sem ${slot.semester}${slot.section ? ` · Sec ${slot.section}` : ''}` : '',
        isDynamic: false
      }));
  }

  // 2. Dynamic Bookings
  const relevantBookings = bookings
    .filter(b => {
      // Date Check
      const bStart = new Date(b.start_time);
      const bDateStr = getIstDateKey(bStart);
      if (bDateStr !== dateStr) return false;
      if (b.status !== 'ACTIVE' && b.status !== 'CONFIRMED' && b.status != null) return false;

      if (teaches(user)) {
        // Faculty's own bookings or bookings they accepted
        // faculty_id is a faculty-directory id, so compare with the user's directory id, not user.id.
        return (user.faculty_id != null && String(b.faculty_id) === String(user.faculty_id)) || String(b.created_by) === String(user.id);
      } else {
        // Student section bookings
        const normalize = (val) => {
          if (!val) return '';
          const v = val.toUpperCase().trim();
          if (v === 'INFORMATION TECHNOLOGY') return 'IT';
          if (v === 'COMPUTER SCIENCE') return 'CS';
          if (v === 'ELECTRONICS') return 'ECE';
          return v;
        };

        const bBranch = normalize(b.branch);
        const uBranch = normalize(user.branch);
        const userSection = String(user.section).trim();
        const userYear = String(user.year || Math.ceil(Number(user.semester || 0) / 2)).trim();
        const bYear = String(b.year).trim();

        return (bBranch === uBranch) && (String(b.section) === userSection) && (bYear === userYear);
      }
    })
    .map(b => {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      const localStartTime = getIstTime(start);
      const localEndTime = getIstTime(end);
      
      return {
        subjectName: b.purpose || 'Rescheduled Class',
        time: b.slot_time || `${localStartTime}-${localEndTime}`,
        room: b.room_name,
        type: 'Re-scheduled',
        faculty: b.faculty_name || 'N/A',
        className: b.class_name || '',
        isDynamic: true,
        bookingId: b.id
      };
    });

  // 3. Subtract Overrides (Only for static classes)
  const filteredStatic = staticClasses.filter(sc => {
    if (!sc.time) return true;
    const scHour = getHourFromTime(sc.time);
    
    const cancellation = availability.find(o => {
      const dbRoomName = (o.room_name || '').trim().toLowerCase();
      const scRoomName = (sc.room || '').trim().toLowerCase();
      
      return (dbRoomName === scRoomName || String(o.room_id) === String(sc.room_id)) && 
             (o.day === dateStr || o.day === dayOfWeek) && 
             parseInt(o.hour) === scHour && 
             o.is_available === true;
    });
    return !cancellation;
  });

  // 4. Filter static slots by Faculty Overrides (if applicable)
  const finalStatic = filteredStatic.filter(sc => {
    if (teaches(user)) {
      const scHour = getHourFromTime(sc.time);
      const isOverridden = (facultyOverrides || []).some(o => {
        const oDate = new Date(o.date).toISOString().split('T')[0];
        return oDate === dateStr && parseInt(o.hour) === scHour && o.is_cancelled;
      });
      return !isOverridden;
    }
    return true;
  });

  const combined = [...finalStatic, ...relevantBookings]
    .sort((a, b) => getSortableMinutes(a.time) - getSortableMinutes(b.time))
    .map(item => ({
      ...item,
      displayTime: formatTo24h(item.time)
    }));

  // Deduplicate: same subject + room + time = same slot
  const seen = new Set();
  return combined.filter(item => {
    const key = `${(item.subjectName || item.subject || '').toLowerCase()}|${(item.room || '').toLowerCase()}|${(item.time || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const roomKey = (roomId, when, hour) => `${roomId}|${when}|${hour}`;
const HOUR_MS = 3_600_000;

/**
 * Indexes the calendar feed (/availability) and bookings by room and hour, the way the server
 * decides (bookingRules.checkRoomTimetable + checkBookingConflicts):
 *  - an ACTIVE booking takes every hour it covers (PENDING requests don't block the room);
 *  - a class or an admin block takes its weekday hour;
 *  - a dated release (class cancelled or moved that date) frees that hour on that date.
 */
export const buildRoomIndex = (bookings = [], availability = []) => {
  const released = new Set();
  const blocked = new Set();
  const booked = new Map();
  for (const a of Array.isArray(availability) ? availability : []) {
    if (a?.room_id == null) continue;
    (a.is_available === true ? released : blocked).add(roomKey(a.room_id, a.day, Number(a.hour)));
  }
  for (const b of Array.isArray(bookings) ? bookings : []) {
    const status = (b.status || 'ACTIVE').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'CONFIRMED') continue;
    const start = new Date(b.start_time).getTime();
    const end = b.end_time ? new Date(b.end_time).getTime() : start + HOUR_MS;
    for (let t = start; t < end; t += HOUR_MS) {
      const k = roomKey(b.room_id, getIstDateKey(t), getIstHour(t));
      if (!booked.has(k)) booked.set(k, b);
    }
  }
  return { released, blocked, booked };
};

/** The ACTIVE booking holding this room at that IST date and hour, if any. */
export const bookingAt = (index, roomId, dateKey, hour) => index.booked.get(roomKey(roomId, dateKey, hour)) || null;

/** Can this room be booked at that IST date (dayName = its weekday) and hour? */
export const isRoomFreeIn = (index, room, dateKey, dayName, hour) => {
  if (!room) return false;
  if (index.booked.has(roomKey(room.id, dateKey, hour))) return false;
  if (index.released.has(roomKey(room.id, dateKey, hour))) return true;
  return !index.blocked.has(roomKey(room.id, dayName, hour)) && !index.blocked.has(roomKey(room.id, dateKey, hour));
};

export const isRoomReallyFree = (room, dateStr, dayName, hour, bookings = [], availability = []) =>
  isRoomFreeIn(buildRoomIndex(bookings, availability), room, dateStr, dayName, hour);

/**
 * Returns a conflicting class (if any) for a given slot and date
 */
export const getClassConflict = (user, dateStr, hour, bookings = [], availability = [], timetableData = []) => {
  const schedule = getMergedSchedule(user, dateStr, bookings, availability, timetableData);
  
  return schedule.find(item => {
    if (!item.time) return false;
    const [startStr, endStr] = item.time.split('-');
    const startHour = getHourFromTime(startStr);
    const endHour = getHourFromTime(endStr || startStr);
    return Number(hour) >= startHour && Number(hour) < endHour;
  });
};

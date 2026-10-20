/**
 * Utility for Timetable and Booking logic
 */
import { getIstDateKey, getIstHour, getIstTime } from './timezone';
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

/**
 * Timetable room names may carry a prefix ("R-6113" for room "6113"). Match the whole name or one
 * whole token of it — never a substring, or room "101" would be blocked by a class in "1101" (NEW-FE-1).
 */
const sameRoomName = (scheduleName, roomName) =>
  scheduleName === roomName || scheduleName.split(/[^a-z0-9]+/).includes(roomName);

export const getHourFromTime = (timeStr) => {
  if (!timeStr) return 0;
  const startPart = timeStr.split('-')[0].trim();
  const match = startPart.match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (!match) return 0;
  let hours = Number(match[1]);
  const meridiem = match[3]?.[0]?.toLowerCase();

  // An explicit AM/PM wins; bare times follow the source data's 12-hour convention (1-7 = PM).
  if (meridiem === 'a') hours %= 12;
  else if (meridiem === 'p') hours = (hours % 12) + 12;
  else if (hours >= 1 && hours < 8) hours += 12;

  return hours;
};

/**
 * Normalizes time strings (e.g., "09:00-10:00") into sortable minutes
 */
export const getSortableMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const startPart = timeStr.split('-')[0].trim();
  const match = startPart.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  
  if (hours >= 1 && hours < 8) hours += 12;
  return (hours * 60) + (minutes || 0);
};

/**
 * Converts "HH:MM-HH:MM" (12h source format) to 24h format for display
 */
export const formatTo24h = (timeStr) => {
  if (!timeStr) return '';
  return timeStr.split('-').map(part => {
    const match = part.trim().match(/(\d{1,2}):(\d{2})/);
    if (!match) return part.trim();
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 1 && hours < 8) hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}`;
  }).join(' - ');
};

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

/**
 * Comprehensive check for room availability across all sources
 */
export const isRoomReallyFree = (room, dateStr, dayName, hour, bookings = [], availability = [], timetableData = []) => {
  if (!room) return false;

  // 1. Base Schedule Status (Static Schedule vs Overrides)
  // Check for override (date-specific or general day-name)
  // SORT to ensure YYYY-MM-DD match comes before day-name match
  const overrides = availability?.filter(a => {
    const dbRoomName = (a.room_name || '').trim().toLowerCase();
    const targetRoomName = (room.name || '').trim().toLowerCase();
    
    return (dbRoomName === targetRoomName || String(a.room_id) === String(room.id)) && 
           (a.day === dateStr || a.day === dayName) && 
           parseInt(a.hour) === hour;
  }).sort((a, b) => {
    // Priority: '2026-03-31' beats 'Tue'
    if (a.day.includes('-') && !b.day.includes('-')) return -1;
    if (!a.day.includes('-') && b.day.includes('-')) return 1;
    return 0;
  });
  
  const override = overrides?.[0];
  
  let baseAvailable = true;

  if (override) {
    baseAvailable = override.is_available === true;
  } else {
    // Check Static Academic Schedule across ANY department
    const isOccupiedInSchedule = Array.isArray(timetableData) ? timetableData.some(entry => {
      const daySchedule = entry.timetable?.[dayName] || [];
      return daySchedule.some(sc => {
        if (!sc.time || !sc.room) return false;
        
        const scRoomName = sc.room.trim().toLowerCase();
        const targetRoomName = room.name.trim().toLowerCase();
        
        if (!sameRoomName(scRoomName, targetRoomName)) return false;
        
        const slotHour = getHourFromTime(sc.time);
        return slotHour === hour;
      });
    }) : (typeof timetableData === 'object' ? (timetableData[dayName] || []).some(sc => {
        if (!sc.time || !sc.room) return false;
        const scRoomName = sc.room.trim().toLowerCase();
        const targetRoomName = room.name.trim().toLowerCase();
        if (!sameRoomName(scRoomName, targetRoomName)) return false;
        const slotHour = getHourFromTime(sc.time);
        return slotHour === hour;
    }) : false);
    
    if (isOccupiedInSchedule) baseAvailable = false;
  }

  // If even the base schedule says it's blocked, it's blocked.
  if (!baseAvailable) return false;

  // 2. Check Dynamic Bookings (Active/Pending)
  const currentBooking = bookings?.some(b => {
    const status = (b.status || 'ACTIVE').toUpperCase();
    if (status !== 'ACTIVE' && status !== 'PENDING' && status !== 'CONFIRMED') return false;
    
    // Use Local Date parts for consistency with UI
    const bStart = new Date(b.start_time);
    const bDateStr = getIstDateKey(bStart);
    const bHour = getIstHour(bStart);
    
    return bDateStr === dateStr && bHour === hour && String(b.room_id) === String(room.id);
  });

  if (currentBooking) return false;

  return true;
};

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

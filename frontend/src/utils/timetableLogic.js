/**
 * Utility for Timetable and Booking logic
 */

import timetableData from '../../../hajiri.timetables.json';

/**
 * Gets the base 5-day week name (Mon, Tue, etc.) from a date string or Date object
 */
export const getDayOfWeek = (dateInput) => {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
};

/**
 * Normalizes time strings (e.g., "01:00-02:00") into a 24-hour integer hour
 * Handles the 12-hour slots in the source JSON (e.g., 01:00 becomes 13:00)
 */
export const getHourFromTime = (timeStr) => {
  if (!timeStr) return 0;
  const startPart = timeStr.split('-')[0].trim();
  let [hours] = startPart.split(':').map(Number);
  
  // Heuristic for 12-hour data in the source JSON: 1-7 likely PM, 8-12 likely AM/Noon
  if (hours >= 1 && hours < 8) hours += 12;
  
  return hours;
};

/**
 * Normalizes time strings (e.g., "09:00-10:00") into sortable minutes
 */
export const getSortableMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const startPart = timeStr.split('-')[0].trim();
  let [hours, minutes] = startPart.split(':').map(Number);
  
  if (hours >= 1 && hours < 8) hours += 12;
  return (hours * 60) + (minutes || 0);
};

/**
 * Converts "HH:MM-HH:MM" (12h source format) to 24h format for display
 */
export const formatTo24h = (timeStr) => {
  if (!timeStr) return '';
  return timeStr.split('-').map(part => {
    let [hours, minutes] = part.trim().split(':').map(Number);
    if (hours >= 1 && hours < 8) hours += 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}`;
  }).join(' - ');
};

/**
 * Resolves the merged schedule for a specific user and date
 */
export const getMergedSchedule = (user, dateStr, bookings = [], availability = []) => {
  if (!user || !user.year || !user.section) return [];
  
  const dayOfWeek = getDayOfWeek(dateStr);
  if (dayOfWeek === 'Sun' || dayOfWeek === 'Sat') return [];

  // Calculate Semester
  const currentMonth = new Date().getMonth();
  const isEvenSemester = currentMonth >= 0 && currentMonth <= 5;
  const calculatedSemester = isEvenSemester ? Number(user.year) * 2 : (Number(user.year) * 2) - 1;
  
  // Normalize User Values
  const userBranch = (user.branch || '').toUpperCase().trim();
  const userDept = (user.department_name || '').toUpperCase().trim();
  const userSection = String(user.section).trim();
  const userSemester = String(calculatedSemester);

  // 1. Static JSON Base
  const entry = timetableData.find(e => {
    const entryDept = (e.department || '').toUpperCase().trim();
    const entrySection = String(e.section).trim();
    const entrySem = String(e.semester).trim();

    const isITMatch = (userBranch === 'IT' || userDept === 'IT') && entryDept === 'INFORMATION TECHNOLOGY';
    const isCSMatch = (userBranch === 'CS' || userDept === 'CS') && entryDept.includes('COMPUTER SCIENCE');
    
    const deptMatch = entryDept === userBranch || 
                      entryDept === userDept || 
                      entryDept.includes(userBranch) || 
                      userBranch.includes(entryDept) ||
                      isITMatch || isCSMatch;

    return deptMatch && entrySection === userSection && entrySem === userSemester;
  });

  const staticClasses = entry?.timetable?.[dayOfWeek] || [];

  // 2. Dynamic Bookings (Section-wide)
  const sectionBookings = bookings
    .filter(b => {
      // Use Local Date parts instead of ISO string
      const bStart = new Date(b.start_time);
      const bDateStr = `${bStart.getFullYear()}-${String(bStart.getMonth() + 1).padStart(2, '0')}-${String(bStart.getDate()).padStart(2, '0')}`;
      
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

      return bDateStr === dateStr && 
             (bBranch === uBranch) && 
             String(b.section) === userSection &&
             (b.status === 'ACTIVE' || b.status === 'CONFIRMED');


    })
    .map(b => {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      
      const localStartTime = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const localEndTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
      
      return {
        subjectName: b.reason || 'Rescheduled Class',
        time: b.slot_time || `${localStartTime}-${localEndTime}`,
        room: b.room_name,
        type: 'Re-scheduled',
        faculty: b.faculty_name || 'N/A',
        isDynamic: true,
        bookingId: b.id
      };
    });


  // 3. Subtract Overrides (Cancellations)
  const filteredStatic = staticClasses.filter(sc => {
    if (!sc.time) return true;
    const scHour = getHourFromTime(sc.time);
    
    // Check if THIS SPECIFIC class is cancelled
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

  return [...filteredStatic, ...sectionBookings]
    .sort((a, b) => getSortableMinutes(a.time) - getSortableMinutes(b.time))
    .map(item => ({
      ...item,
      displayTime: formatTo24h(item.time)
    }));
};

/**
 * Comprehensive check for room availability across all sources
 */
export const isRoomReallyFree = (room, dateStr, dayName, hour, bookings = [], availability = []) => {
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
    const isOccupiedInSchedule = timetableData.some(entry => {
      const daySchedule = entry.timetable?.[dayName] || [];
      return daySchedule.some(sc => {
        if (!sc.time || !sc.room) return false;
        
        const scRoomName = sc.room.trim().toLowerCase();
        const targetRoomName = room.name.trim().toLowerCase();
        
        // Match exact or contains (e.g. "R-6113" in JSON vs "6113" in DB)
        if (scRoomName !== targetRoomName && !scRoomName.includes(targetRoomName)) return false;
        
        const slotHour = getHourFromTime(sc.time);
        return slotHour === hour;
      });
    });
    
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
    const bDateStr = `${bStart.getFullYear()}-${String(bStart.getMonth() + 1).padStart(2, '0')}-${String(bStart.getDate()).padStart(2, '0')}`;
    const bHour = bStart.getHours();
    
    return bDateStr === dateStr && bHour === hour && String(b.room_id) === String(room.id);
  });

  if (currentBooking) return false;

  return true;
};

/**
 * Returns a conflicting class (if any) for a given slot and date
 */
export const getClassConflict = (user, dateStr, hour, bookings = [], availability = []) => {
  const schedule = getMergedSchedule(user, dateStr, bookings, availability);
  
  return schedule.find(item => {
    if (!item.time) return false;
    const itemHour = getHourFromTime(item.time);
    return itemHour === hour;
  });
};

/**
 * Utility for Timetable and Booking logic (Shared with Backend)
 */

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

export const WEEKDAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

/** "monday", "MON", "Mon" → "Mon"; anything else → null. */
export const normalizeDay = (day) => {
  const d = String(day || '').trim().slice(0, 3).toLowerCase();
  return WEEKDAYS.find((w) => w.toLowerCase() === d) || null;
};

/**
 * Minutes since IST midnight for a timetable time. An explicit AM/PM is honoured ("07:30 AM",
 * "2:00 pm"); bare times follow the source data's 12-hour convention, where 01:00–07:59 means PM.
 * Migration v36 backfills timetable start/end minutes with the same rule in SQL.
 */
export function timetableMinutes(hhmm) {
  const m = String(hhmm || '').trim().match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const meridiem = m[3]?.[0]?.toLowerCase();
  if (meridiem === 'a') h = h % 12;
  else if (meridiem === 'p') h = (h % 12) + 12;
  else if (h >= 1 && h < 8) h += 12;
  return h * 60 + Number(m[2]);
}

/** "HH:MM-HH:MM" → { startMin, endMin } (an end at or before the start is read as 12h later), or null. */
export function parseSlotTime(slotTime) {
  const [a, b] = String(slotTime || '').split('-');
  const startMin = timetableMinutes(a);
  let endMin = timetableMinutes(b);
  if (startMin == null || endMin == null) return null;
  if (endMin <= startMin) endMin += 12 * 60; // e.g. "12:00-01:00"
  if (endMin > 24 * 60) return null;
  return { startMin, endMin };
}

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

/**
 * Timetable helpers for the backend. The time rules themselves are in /shared/timetable.js.
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

// Timetable time rules live in /shared (the frontend uses the same module).
export {
  WEEKDAYS, normalizeDay, timetableMinutes, parseSlotTime, getHourFromTime, getSortableMinutes, formatTo24h, overlapsMinutes,
} from '../../../shared/timetable.js';

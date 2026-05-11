/**
 * Utility for Timetable and Booking logic (Shared with Backend)
 */

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

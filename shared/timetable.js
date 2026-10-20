/**
 * Timetable times, shared by the backend and the frontend. Source timetables write times on a
 * 12-hour clock without AM/PM: 01:00–07:59 means afternoon. An explicit AM/PM is honoured.
 * The database stores start_min/end_min computed by these rules (migration v36 mirrors them in SQL).
 */
export const WEEKDAYS = Object.freeze(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

/** "monday", "MON", "Mon" → "Mon"; anything else → null. */
export const normalizeDay = (day) => {
  const d = String(day || '').trim().slice(0, 3).toLowerCase();
  return WEEKDAYS.find((w) => w.toLowerCase() === d) || null;
};

/** Minutes since IST midnight for one timetable time ("09:30", "2:00 pm"), or null. */
export function timetableMinutes(hhmm) {
  const m = String(hhmm || '').trim().match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const meridiem = m[3]?.[0]?.toLowerCase();
  if (meridiem === 'a') h %= 12;
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
  if (endMin <= startMin || endMin > 24 * 60) return null; // still backwards, or past midnight
  return { startMin, endMin };
}

/** Start minute of a slot (for sorting); 0 when unreadable. */
export const getSortableMinutes = (slotTime) => timetableMinutes(String(slotTime || '').split('-')[0]) ?? 0;

/** Start hour of a slot; 0 when unreadable. */
export const getHourFromTime = (slotTime) => Math.floor(getSortableMinutes(slotTime) / 60);

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "02:00-03:30" → "14:00 - 15:30" for display; parts that can't be read are shown as written. */
export const formatTo24h = (slotTime) => {
  if (!slotTime) return '';
  return String(slotTime).split('-').map((part) => {
    const m = timetableMinutes(part);
    return m == null ? part.trim() : hhmm(m);
  }).join(' - ');
};

/** Do [startMin, endMin) and a class's [start_min, end_min) overlap? */
export const overlapsMinutes = (startMin, endMin, cls) => cls.start_min < endMin && startMin < cls.end_min;

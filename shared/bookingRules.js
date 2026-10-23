/** Booking hours and limits, shared so the calendar offers exactly what the server accepts. */
export const BOOKING_RULES = Object.freeze({
  OPEN_HOUR: 8, // earliest start, IST
  CLOSE_HOUR: 18, // latest end, IST (final slot is 17:00–18:00)
  MAX_HOURS: 4,
  WINDOW_DAYS: 7, // how far ahead non-admins may book
});

/** Start hours a booking can begin at: 08 … 17 (the last slot is 17:00–18:00). */
export const BOOKING_START_HOURS = Object.freeze(
  Array.from({ length: BOOKING_RULES.CLOSE_HOUR - BOOKING_RULES.OPEN_HOUR }, (_, i) => BOOKING_RULES.OPEN_HOUR + i),
);

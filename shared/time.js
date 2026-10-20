/**
 * Campus (IST) date helpers, shared by the backend and the frontend. IST is UTC+05:30 all year.
 * A "date key" is a campus calendar date, "YYYY-MM-DD".
 */
export const CAMPUS_TIME_ZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** { day: 'Mon', date: 'YYYY-MM-DD', hour, minute } of an instant, on the campus clock. */
export const getIstParts = (value) => {
  const parts = partsFormatter.formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { day: get('weekday'), date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
};

/**
 * Days since the epoch for a real "YYYY-MM-DD" calendar date, or null for anything else
 * (wrong shape, or a roll-over such as 2026-02-30).
 */
export const dateKeyToDays = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d.getTime() / 86_400_000;
};

export const isDateKey = (key) => dateKeyToDays(key) !== null;

/** Today's campus date. */
export const istToday = (now = Date.now()) => getIstParts(now).date;

/** A campus date and wall-clock time → the UTC instant (ISO string) the API and timestamptz use. */
export const istDateTimeToUtc = (dateKey, hour, minute = 0) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(hour), Number(minute)) - IST_OFFSET_MS).toISOString();
};

/** Calendar-day arithmetic on date keys (no time zone involved). */
export const addDaysToKey = (dateKey, days) =>
  new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

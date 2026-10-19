export const CAMPUS_TIME_ZONE = 'Asia/Kolkata';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

export const getIstParts = (value) => {
  const parts = formatter.formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { day: get('weekday'), date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
};

/**
 * Days since the epoch for a real "YYYY-MM-DD" calendar date, or null for anything else
 * (wrong shape, or a roll-over such as 2026-02-30 — NEW-P4-6).
 */
export const dateKeyToDays = (key) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return d.getTime() / 86_400_000;
};

export const isDateKey = (key) => dateKeyToDays(key) !== null;

export const istDateTimeToUtc = (dateKey, hour, minute = 0) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(hour), Number(minute)) - (5.5 * 60 * 60 * 1000)).toISOString();
};

const humanDate = new Intl.DateTimeFormat('en-IN', { timeZone: CAMPUS_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const humanTime = new Intl.DateTimeFormat('en-GB', { timeZone: CAMPUS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Human-readable IST date and time range for emails, e.g. { date: 'Tue, 20 Oct 2026', time: '10:00 – 11:00' }. */
export const formatIstRange = (start, end) => ({
  date: humanDate.format(new Date(start)),
  time: `${humanTime.format(new Date(start))} – ${humanTime.format(new Date(end))}`,
});

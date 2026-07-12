export const CAMPUS_TIME_ZONE = 'Asia/Kolkata';

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: CAMPUS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TIME_ZONE, weekday: 'short' });

export const getIstDateKey = (value) => {
  const parts = dateFormatter.formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

export const getIstHour = (value) => Number(timeFormatter.formatToParts(new Date(value)).find((item) => item.type === 'hour')?.value);
export const getIstTime = (value) => timeFormatter.format(new Date(value));
export const getIstWeekday = (dateKey) => weekdayFormatter.format(new Date(istDateTimeToUtc(dateKey, 12)));

// A selected calendar day and hour are campus-local values. Convert them to the
// UTC instant used by the API and PostgreSQL timestamptz columns.
export const istDateTimeToUtc = (dateKey, hour, minute = 0) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(hour), Number(minute)) - (5.5 * 60 * 60 * 1000)).toISOString();
};

export const addMinutesToUtc = (utcValue, minutes) => new Date(new Date(utcValue).getTime() + minutes * 60 * 1000).toISOString();

// Campus date rules live in /shared (the backend uses the same module).
import { CAMPUS_TIME_ZONE, istDateTimeToUtc, addDaysToKey } from '../../../shared/time.js';

export { CAMPUS_TIME_ZONE, istDateTimeToUtc, isDateKey, istToday, addDaysToKey } from '../../../shared/time.js';

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

export const addMinutesToUtc = (utcValue, minutes) => new Date(new Date(utcValue).getTime() + minutes * 60 * 1000).toISOString();

export const mondayOfKey = (dateKey) => {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay() || 7; // Sunday → 7
  return addDaysToKey(dateKey, 1 - weekday);
};

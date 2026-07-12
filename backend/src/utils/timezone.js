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

export const istDateTimeToUtc = (dateKey, hour, minute = 0) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(hour), Number(minute)) - (5.5 * 60 * 60 * 1000)).toISOString();
};

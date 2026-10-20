// Campus date rules live in /shared (the frontend uses the same module).
import { CAMPUS_TIME_ZONE } from '../../../shared/time.js';

export {
  CAMPUS_TIME_ZONE, IST_OFFSET_MS, getIstParts, dateKeyToDays, isDateKey, istToday, istDateTimeToUtc, addDaysToKey,
} from '../../../shared/time.js';

const humanDate = new Intl.DateTimeFormat('en-IN', { timeZone: CAMPUS_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const humanTime = new Intl.DateTimeFormat('en-GB', { timeZone: CAMPUS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Human-readable IST date and time range for emails, e.g. { date: 'Tue, 20 Oct 2026', time: '10:00 – 11:00' }. */
export const formatIstRange = (start, end) => ({
  date: humanDate.format(new Date(start)),
  time: `${humanTime.format(new Date(start))} – ${humanTime.format(new Date(end))}`,
});

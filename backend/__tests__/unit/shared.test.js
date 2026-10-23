// /shared: the rules the backend and the frontend both use (the frontend runs the same module).
import { parseSlotTime, timetableMinutes, normalizeDay, getHourFromTime, getSortableMinutes, formatTo24h, overlapsMinutes } from '../../../shared/timetable.js';
import { istDateTimeToUtc, getIstParts, isDateKey, istToday, addDaysToKey } from '../../../shared/time.js';
import { BOOKING_RULES, BOOKING_START_HOURS } from '../../../shared/bookingRules.js';
import { RULES } from '../../src/services/bookingRules.js';

describe('shared/timetable', () => {
  test.each([
    ['09:00-10:00', 540, 600], ['01:00-02:00', 780, 840], ['11:00-01:00', 660, 780], ['12:00-01:00', 720, 780],
    ['08:00-10:00', 480, 600], ['07:30 AM-08:30 AM', 450, 510], ['2:00 pm-3:30 pm', 840, 930], [' 10:00 - 11:00 ', 600, 660],
  ])('parseSlotTime(%s) = %i..%i', (slot, startMin, endMin) => {
    expect(parseSlotTime(slot)).toEqual({ startMin, endMin });
  });

  test.each(['', 'nine', '09:00', null, '11:00 PM-01:00 AM'])('parseSlotTime(%p) is null', (slot) => {
    expect(parseSlotTime(slot)).toBeNull();
  });

  test('single times, start hour/minute and display', () => {
    expect(timetableMinutes('12:00 am')).toBe(0);
    expect(getHourFromTime('02:00-03:00')).toBe(14);
    expect(getHourFromTime('rubbish')).toBe(0);
    expect(getSortableMinutes('09:45-10:30')).toBe(585);
    expect(formatTo24h('02:00-03:30')).toBe('14:00 - 15:30');
    expect(formatTo24h('TBA')).toBe('TBA');
  });

  test('weekday names and overlap', () => {
    expect(['monday', 'MON', 'Tue', 'x', ''].map(normalizeDay)).toEqual(['Mon', 'Mon', 'Tue', null, null]);
    expect(overlapsMinutes(600, 660, { start_min: 630, end_min: 690 })).toBe(true);
    expect(overlapsMinutes(600, 660, { start_min: 660, end_min: 720 })).toBe(false);
  });
});

describe('shared/time', () => {
  test('IST conversions and calendar dates', () => {
    expect(istDateTimeToUtc('2026-10-20', 9)).toBe('2026-10-20T03:30:00.000Z');
    expect(getIstParts('2026-10-19T19:00:00Z')).toEqual({ day: 'Tue', date: '2026-10-20', hour: 0, minute: 30 });
    expect(istToday(Date.parse('2026-10-19T19:00:00Z'))).toBe('2026-10-20');
    expect(['2026-02-28', '2026-02-30', '20-10-2026'].map(isDateKey)).toEqual([true, false, false]);
    expect(addDaysToKey('2026-10-30', 3)).toBe('2026-11-02');
  });
});

describe('shared/bookingRules', () => {
  test('the server enforces exactly the hours the calendar offers', () => {
    expect(RULES).toBe(BOOKING_RULES);
    expect(BOOKING_START_HOURS).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

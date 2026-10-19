// Unit tests for src/utils/timetableLogic.js (pure). Source timetable data uses 12-hour times
// without AM/PM; hours 1..7 are assumed to be PM.
import { getDayOfWeek, getHourFromTime, getSortableMinutes, formatTo24h } from '../../src/utils/timetableLogic.js';

describe('getDayOfWeek', () => {
  test.each([
    ['2026-10-19', 'Mon'],
    ['2026-10-24', 'Sat'],
    ['2026-10-25', 'Sun'],
    ['2028-02-29', 'Tue'],
    ['2027-01-01', 'Fri'],
  ])('YYYY-MM-DD %s -> %s (calendar date, independent of server TZ)', (date, day) => {
    expect(getDayOfWeek(date)).toBe(day);
  });

  test('Date objects use the local calendar day', () => {
    expect(getDayOfWeek(new Date(2026, 9, 21, 12))).toBe('Wed');
  });
});

describe('getHourFromTime', () => {
  test.each([
    ['09:00-10:00', 9],
    ['08:00', 8],
    ['12:00-01:00', 12],
    ['01:00-02:00', 13], // 1..7 treated as PM
    ['02:00', 14],
    ['07:30', 19], // QUESTION: a genuine 07:30 AM slot can't be represented
    ['T702:00-03:00', 14], // prefixed room codes in source data
    [' 11:00 - 12:00', 11],
    ['00:30', 0],
  ])('%s -> %i', (input, hour) => {
    expect(getHourFromTime(input)).toBe(hour);
  });

  test.each([undefined, null, '', 'TBA', '9am'])('unparsable %p -> 0', (input) => {
    expect(getHourFromTime(input)).toBe(0);
  });
});

describe('getSortableMinutes', () => {
  test('orders afternoon (12h) slots after morning slots', () => {
    const slots = ['02:00-03:00', '09:00-10:00', '12:00-01:00', '11:30-12:30', '01:00-02:00'];
    const sorted = [...slots].sort((a, b) => getSortableMinutes(a) - getSortableMinutes(b));
    expect(sorted).toEqual(['09:00-10:00', '11:30-12:30', '12:00-01:00', '01:00-02:00', '02:00-03:00']);
  });

  test.each([
    ['09:15-10:00', 9 * 60 + 15],
    ['01:30-02:30', 13 * 60 + 30],
    ['', 0],
    ['n/a', 0],
  ])('%p -> %i', (input, minutes) => {
    expect(getSortableMinutes(input)).toBe(minutes);
  });
});

describe('formatTo24h', () => {
  test.each([
    ['09:00-10:00', '09:00 - 10:00'],
    ['12:00-01:00', '12:00 - 13:00'],
    ['02:00-03:00', '14:00 - 15:00'],
    ['9:5-10:00', '9:5 - 10:00'], // single-digit minutes don't match HH:MM -> left as is
    ['TBA', 'TBA'],
    ['', ''],
    [null, ''],
  ])('%p -> %p', (input, out) => {
    expect(formatTo24h(input)).toBe(out);
  });
});

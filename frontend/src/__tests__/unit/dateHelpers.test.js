import { describe, it, expect } from 'vitest';
import {
  getSmartTodayDate, getInitialBookingDateObject, getInitialBookingDateString,
  getTodayRange, getWeekRange, formatRangeToISO, getDatesOfWeek,
} from '../../utils/dateHelpers';
import { getIstDateKey, getIstHour, getIstTime, getIstWeekday, istDateTimeToUtc, addMinutesToUtc } from '../../utils/timezone';
import { getRoleLabel, toTitleCase, getShortDept } from '../../utils/roleUtils';
import { runInIST, ist } from '../utils/ist';

// All local-time helpers are exercised with the worker switched to IST (container default is UTC).
// Week of 2026-10-19 (Mon) .. 2026-10-25 (Sun).
runInIST();

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('dateHelpers.getSmartTodayDate (IST)', () => {
  it.each([
    ['Mon 10:00 stays today', ist(2026, 10, 19, 10), '2026-10-19'],
    ['Mon 18:59 stays today (19:00–20:00 is still bookable)', ist(2026, 10, 19, 18, 59), '2026-10-19'],
    ['Mon 19:00 rolls to Tue', ist(2026, 10, 19, 19), '2026-10-20'],
    ['Thu 23:30 rolls to Fri', ist(2026, 10, 22, 23, 30), '2026-10-23'],
    ['Fri 19:00 rolls to Mon', ist(2026, 10, 23, 19), '2026-10-26'],
    ['Sat any time -> Mon', ist(2026, 10, 24, 9), '2026-10-26'],
    ['Sun any time -> Mon', ist(2026, 10, 25, 22), '2026-10-26'],
    ['Fri 19:00 across month end', ist(2026, 10, 30, 19), '2026-11-02'],
  ])('%s', (_l, now, expected) => {
    expect(key(getSmartTodayDate(now))).toBe(expected);
  });

  it('does not mutate the input date', () => {
    const now = ist(2026, 10, 24, 9);
    const before = now.getTime();
    getSmartTodayDate(now);
    expect(now.getTime()).toBe(before);
  });

  it('getInitialBookingDateObject pins 08:00 local on the smart day', () => {
    const d = getInitialBookingDateObject(ist(2026, 10, 23, 19));
    expect(key(d)).toBe('2026-10-26');
    expect([d.getHours(), d.getMinutes()]).toEqual([8, 0]);
    expect(d.toISOString()).toBe('2026-10-26T02:30:00.000Z');
  });

  it('getInitialBookingDateString is the IST calendar day (early-morning IST is not "yesterday")', () => {
    // 01:00 IST Tue == 19:30 UTC Mon — must still be Tuesday for the user.
    expect(getInitialBookingDateString(ist(2026, 10, 20, 1))).toBe('2026-10-20');
  });
});

describe('dateHelpers ranges (IST)', () => {
  it('getTodayRange spans local midnight..23:59:59.999 of the smart day', () => {
    const { start, end } = getTodayRange(ist(2026, 10, 21, 12));
    expect(start.toISOString()).toBe('2026-10-20T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-10-21T18:29:59.999Z');
  });

  it('getTodayRange once the last slot (19:00) has started is tomorrow', () => {
    const { start } = getTodayRange(ist(2026, 10, 21, 19, 30));
    expect(key(start)).toBe('2026-10-22');
  });

  it.each([
    ['Mon', ist(2026, 10, 19, 9), '2026-10-19', '2026-10-25'],
    ['Wed', ist(2026, 10, 21, 9), '2026-10-19', '2026-10-25'],
    ['Fri late', ist(2026, 10, 23, 23), '2026-10-19', '2026-10-25'],
    ['Sat -> next week', ist(2026, 10, 24, 9), '2026-10-26', '2026-11-01'],
    ['Sun -> next week', ist(2026, 10, 25, 9), '2026-10-26', '2026-11-01'],
  ])('getWeekRange %s', (_l, now, mon, sun) => {
    const { start, end } = getWeekRange(now);
    expect(key(start)).toBe(mon);
    expect(key(end)).toBe(sun);
    expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
  });

  it('formatRangeToISO serialises instants (IST midnight = 18:30Z previous day)', () => {
    const r = formatRangeToISO(getWeekRange(ist(2026, 10, 21, 9)));
    expect(r).toEqual({ start: '2026-10-18T18:30:00.000Z', end: '2026-10-25T18:29:59.999Z' });
  });

  it.each([
    ['2026-10-19', ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']],
    ['2026-10-23', ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']],
    ['2026-10-25', ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']],
    ['2026-11-01', ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']],
  ])('getDatesOfWeek(%s) returns Mon..Fri keys', (base, expected) => {
    expect(getDatesOfWeek(base)).toEqual(expected);
  });
});

describe('utils/timezone (explicit Asia/Kolkata, independent of process TZ)', () => {
  it('getIstDateKey / getIstHour / getIstTime around IST midnight', () => {
    const v = '2026-10-19T18:45:00.000Z'; // 00:15 IST Oct 20
    expect(getIstDateKey(v)).toBe('2026-10-20');
    expect(getIstHour(v)).toBe(0);
    expect(getIstTime(v)).toBe('00:15');
  });

  it('istDateTimeToUtc converts campus wall-clock to UTC ISO', () => {
    expect(istDateTimeToUtc('2026-10-20', 9)).toBe('2026-10-20T03:30:00.000Z');
    expect(istDateTimeToUtc('2026-10-20', 0)).toBe('2026-10-19T18:30:00.000Z');
    expect(istDateTimeToUtc('2026-10-20', '17', '30')).toBe('2026-10-20T12:00:00.000Z');
  });

  it('round-trips date+hour', () => {
    for (let h = 8; h < 18; h++) {
      const u = istDateTimeToUtc('2026-12-31', h);
      expect(getIstDateKey(u)).toBe('2026-12-31');
      expect(getIstHour(u)).toBe(h);
    }
  });

  it('getIstWeekday + addMinutesToUtc', () => {
    expect(getIstWeekday('2026-10-19')).toBe('Mon');
    expect(getIstWeekday('2026-10-25')).toBe('Sun');
    expect(addMinutesToUtc('2026-10-20T03:30:00.000Z', 60)).toBe('2026-10-20T04:30:00.000Z');
  });
});

describe('roleUtils', () => {
  it('toTitleCase', () => {
    expect(toTitleCase('INFORMATION TECHNOLOGY')).toBe('Information Technology');
    expect(toTitleCase('')).toBe('');
    expect(toTitleCase(null)).toBe('');
  });
  it('getShortDept is case-insensitive and falls back to input', () => {
    expect(getShortDept('Computer Science and Engineering')).toBe('CS');
    expect(getShortDept('information technology')).toBe('IT');
    expect(getShortDept('Physics')).toBe('Physics');
    expect(getShortDept(undefined)).toBe('');
  });
  it('getRoleLabel does not recognise lowercase roles (see FE-03)', () => {
    expect(getRoleLabel('admin')).toBe('admin');
  });
});

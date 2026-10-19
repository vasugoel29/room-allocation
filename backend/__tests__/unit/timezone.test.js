// Unit tests for src/utils/timezone.js (pure, no DB). IST = UTC+05:30, no DST.
import { getIstParts, istDateTimeToUtc, CAMPUS_TIME_ZONE } from '../../src/utils/timezone.js';

test('campus time zone is Asia/Kolkata', () => {
  expect(CAMPUS_TIME_ZONE).toBe('Asia/Kolkata');
});

describe('getIstParts', () => {
  test.each([
    // UTC instant                 IST day, date, hour, minute
    ['2026-10-18T18:29:00.000Z', 'Sun', '2026-10-18', 23, 59], // last IST minute of Sunday
    ['2026-10-18T18:30:00.000Z', 'Mon', '2026-10-19', 0, 0], // IST midnight = 18:30Z the previous UTC day
    ['2026-10-18T23:59:59.000Z', 'Mon', '2026-10-19', 5, 29], // just before UTC midnight
    ['2026-10-19T00:00:00.000Z', 'Mon', '2026-10-19', 5, 30], // UTC midnight
    ['2026-10-19T12:15:00.000Z', 'Mon', '2026-10-19', 17, 45],
    ['2026-12-31T18:30:00.000Z', 'Fri', '2027-01-01', 0, 0], // year rollover happens in IST first
    ['2028-02-28T18:30:00.000Z', 'Tue', '2028-02-29', 0, 0], // leap day
  ])('%s -> %s %s %i:%i IST', (iso, day, date, hour, minute) => {
    expect(getIstParts(iso)).toEqual({ day, date, hour, minute });
  });

  test('accepts Date objects and epoch milliseconds', () => {
    const iso = '2026-10-19T03:30:00.000Z';
    const expected = { day: 'Mon', date: '2026-10-19', hour: 9, minute: 0 };
    expect(getIstParts(new Date(iso))).toEqual(expected);
    expect(getIstParts(Date.parse(iso))).toEqual(expected);
  });

  test('hour uses the 0-23 cycle (midnight is 0, never 24)', () => {
    expect(getIstParts('2026-10-18T18:30:00.000Z').hour).toBe(0);
  });

  test('an invalid date throws', () => {
    expect(() => getIstParts('not a date')).toThrow(RangeError);
  });
});

describe('istDateTimeToUtc', () => {
  test.each([
    ['2026-10-19', 0, 0, '2026-10-18T18:30:00.000Z'], // IST midnight is still the previous UTC day
    ['2026-10-19', 5, 29, '2026-10-18T23:59:00.000Z'],
    ['2026-10-19', 5, 30, '2026-10-19T00:00:00.000Z'], // crosses UTC midnight here
    ['2026-10-19', 9, 0, '2026-10-19T03:30:00.000Z'],
    ['2026-10-19', 23, 59, '2026-10-19T18:29:00.000Z'],
    ['2027-01-01', 0, 0, '2026-12-31T18:30:00.000Z'],
    ['2028-03-01', 3, 0, '2028-02-29T21:30:00.000Z'],
  ])('%s %i:%i IST -> %s', (dateKey, hour, minute, iso) => {
    expect(istDateTimeToUtc(dateKey, hour, minute)).toBe(iso);
  });

  test('minute defaults to 0 and numeric strings are accepted', () => {
    expect(istDateTimeToUtc('2026-10-19', '09')).toBe('2026-10-19T03:30:00.000Z');
    expect(istDateTimeToUtc('2026-10-19', 9, '30')).toBe('2026-10-19T04:00:00.000Z');
  });

  test('out-of-range hours roll over like Date.UTC (24:00 = next day 00:00)', () => {
    expect(istDateTimeToUtc('2026-10-19', 24)).toBe(istDateTimeToUtc('2026-10-20', 0));
  });

  test('round-trips with getIstParts for every hour of a day', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        expect(getIstParts(istDateTimeToUtc('2026-03-31', h, m))).toMatchObject({ date: '2026-03-31', hour: h, minute: m });
      }
    }
  });

  test('a malformed date key throws instead of producing a bogus instant', () => {
    expect(() => istDateTimeToUtc('garbage', 9)).toThrow(RangeError);
  });
});

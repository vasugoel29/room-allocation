import { describe, it, expect } from 'vitest';
import { getDayOfWeek, getHourFromTime, getSortableMinutes, formatTo24h } from '../utils/timetableLogic';

describe('timetableLogic utility tests', () => {
  describe('getDayOfWeek', () => {
    it('should correctly identify days of the week', () => {
      // 2026-07-11 is a Saturday
      expect(getDayOfWeek('2026-07-11')).toBe('Sat');
      // 2026-07-13 is a Monday
      expect(getDayOfWeek('2026-07-13')).toBe('Mon');
      // 2026-07-14 is a Tuesday
      expect(getDayOfWeek('2026-07-14')).toBe('Tue');
    });
  });

  describe('getHourFromTime', () => {
    it('should map 12-hour format strings to 24-hour hour integers', () => {
      expect(getHourFromTime('09:00 - 10:00')).toBe(9);
      expect(getHourFromTime('01:00 - 02:00')).toBe(13); // 1 PM heuristic -> 13
      expect(getHourFromTime('12:00 - 01:00')).toBe(12);
      expect(getHourFromTime('05:30 - 06:30')).toBe(17);
    });
  });

  describe('getSortableMinutes', () => {
    it('should compute sortable minutes from time slots', () => {
      expect(getSortableMinutes('09:00 - 10:00')).toBe(9 * 60);
      expect(getSortableMinutes('01:30 - 02:30')).toBe(13 * 60 + 30);
    });
  });

  describe('formatTo24h', () => {
    it('should format 12-hour format range to 24-hour format string', () => {
      expect(formatTo24h('09:00-10:00')).toBe('09:00 - 10:00');
      expect(formatTo24h('01:00-02:00')).toBe('13:00 - 14:00');
      expect(formatTo24h('12:00-01:00')).toBe('12:00 - 13:00');
    });
  });
});

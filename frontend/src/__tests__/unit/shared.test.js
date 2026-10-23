import { describe, it, expect } from 'vitest';
import { BOOKING_START_HOURS } from '../../../../shared/bookingRules.js';
import { getHourFromTime, formatTo24h } from '../../utils/timetableLogic';
import { istDateTimeToUtc } from '../../utils/timezone';

// The frontend runs the same /shared module as the server (full tests: backend/__tests__/unit/shared.test.js).
describe('shared rules in the frontend', () => {
  it('uses the shared booking hours, timetable times and IST conversion', () => {
    expect(BOOKING_START_HOURS[0]).toBe(8);
    expect(BOOKING_START_HOURS.at(-1)).toBe(17);
    expect(getHourFromTime('02:00 PM-03:00 PM')).toBe(14);
    expect(formatTo24h('12:00-01:00')).toBe('12:00 - 13:00');
    expect(istDateTimeToUtc('2026-10-20', 9)).toBe('2026-10-20T03:30:00.000Z');
  });
});

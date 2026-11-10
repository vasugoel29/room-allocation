import { describe, it, expect } from 'vitest';
import { BOOKING_START_HOURS } from '../../../../shared/bookingRules.js';
import { getHourFromTime, formatTo24h } from '../../utils/timetableLogic';
import { istDateTimeToUtc } from '../../utils/timezone';
import { MACHINES, BOOKING, TRANSFER, TONES, stateIds, openStates, isOpen, statusLabel, statusTone } from '../../../../shared/stateMachines.js';

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

describe('shared state machines in the frontend', () => {
  it('every state of every machine has a label and a tone the badge knows', () => {
    for (const machine of Object.values(MACHINES)) {
      for (const id of stateIds(machine)) {
        expect(statusLabel(machine, id)).toBeTruthy();
        expect(TONES).toContain(statusTone(machine, id));
      }
    }
    expect(openStates(BOOKING)).toEqual(['PENDING', 'ACTIVE']);
    expect(isOpen(TRANSFER, 'REP2_ACCEPTED')).toBe(true);
    expect(isOpen(TRANSFER, 'CANCELLED')).toBe(false);
  });
});

// Unit tests for the pure parts of src/services/bookingRules.js (the single rule set shared by
// create, reschedule, quick-book and approval). Times are fixed, so these never depend on "today".
import {
  RULES, checkTimes, checkRoom, slotOverlaps, timetableMinutes, dateInSameWeek, constraintConflict, isStaff,
} from '../../src/services/bookingRules.js';
import { istDateTimeToUtc, formatIstRange } from '../../src/utils/timezone.js';
import { closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

// Mon 2030-01-07 .. Sun 2030-01-13 (IST). "now" = Sun 2030-01-06 12:00 IST.
const NOW = new Date(istDateTimeToUtc('2030-01-06', 12)).getTime();
const at = (date, hour, minute = 0) => istDateTimeToUtc(date, hour, minute);
const times = (s, e, opts = {}) => checkTimes(s, e, { role: 'STUDENT_REP', now: NOW, ...opts });

describe('checkTimes', () => {
  test('a valid weekday request is normalised to IST day, date and hours', () => {
    expect(times(at('2030-01-07', 10), at('2030-01-07', 12))).toEqual({
      ok: {
        start: at('2030-01-07', 10), end: at('2030-01-07', 12), day: 'Mon', dateKey: '2030-01-07',
        startHour: 10, endHour: 12, startMin: 600, endMin: 720,
      },
    });
  });

  test.each([
    ['missing start', [undefined, at('2030-01-07', 11)], 'start_time and end_time must be valid timestamps'],
    ['garbage end', [at('2030-01-07', 10), 'soon'], 'start_time and end_time must be valid timestamps'],
    ['end before start', [at('2030-01-07', 11), at('2030-01-07', 10)], 'end_time must be after start_time'],
    ['end == start', [at('2030-01-07', 10), at('2030-01-07', 10)], 'end_time must be after start_time'],
    ['start at :30 IST', [at('2030-01-07', 10, 30), at('2030-01-07', 11, 30)], 'Bookings start and end on the hour'],
    ['end at :15 IST', [at('2030-01-07', 10), at('2030-01-07', 11, 15)], 'Bookings start and end on the hour'],
    ['seconds', ['2030-01-07T04:30:01.000Z', at('2030-01-07', 11)], 'Bookings start and end on the hour'],
    ['milliseconds', ['2030-01-07T04:30:00.500Z', at('2030-01-07', 11)], 'Bookings start and end on the hour'],
    ['UTC hour (= :30 IST)', ['2030-01-07T04:00:00.000Z', '2030-01-07T05:00:00.000Z'], 'Bookings start and end on the hour'],
    ['5 hours', [at('2030-01-07', 9), at('2030-01-07', 14)], 'Bookings last between 1 and 4 hours'],
    ['crosses midnight', [at('2030-01-07', 20), at('2030-01-08', 0)], 'A booking must start and end on the same day'],
    ['before 08:00', [at('2030-01-07', 7), at('2030-01-07', 9)], 'Rooms can be booked between 08:00 and 20:00'],
    ['after 20:00', [at('2030-01-07', 19), at('2030-01-07', 21)], 'Rooms can be booked between 08:00 and 20:00'],
    ['in the past', [at('2030-01-06', 10), at('2030-01-06', 11)], 'Cannot book in the past'],
    ['starting exactly now', [at('2030-01-06', 12), at('2030-01-06', 13)], 'Cannot book in the past'],
    ['more than 7 days ahead', [at('2030-01-14', 10), at('2030-01-14', 11)], 'Regular bookings allowed only for the current week'],
    ['Saturday for a student', [at('2030-01-12', 10), at('2030-01-12', 11)], 'Students are not allowed to book rooms on weekends'],
  ])('%s → 400', (_n, [s, e], error) => {
    expect(times(s, e)).toEqual({ error, status: 400 });
  });

  test.each([['08:00–09:00', 8, 9], ['16:00–20:00 (4 h, up to closing)', 16, 20], ['13:00–14:00', 13, 14]])('%s is fine', (_n, h1, h2) => {
    expect(times(at('2030-01-07', h1), at('2030-01-07', h2)).ok).toBeDefined();
  });

  test('the 7-day window is measured from now; staff may book weekends; admins have no window', () => {
    expect(times(at('2030-01-13', 11), at('2030-01-13', 12), { role: 'FACULTY' }).ok).toBeDefined(); // Sun, < 7 days
    expect(times(at('2030-01-13', 11), at('2030-01-13', 12), { role: 'STUDENT_REP' }).error).toMatch(/weekends/);
    expect(times(at('2030-01-13', 13), at('2030-01-13', 14), { role: 'FACULTY' }).error).toMatch(/current week/); // > 7 days
    expect(times(at('2030-03-04', 10), at('2030-03-04', 11), { role: 'ADMIN' }).ok).toBeDefined();
  });

  test('approve mode ignores the window/weekend rules but not the start rule', () => {
    expect(times(at('2030-03-09', 10), at('2030-03-09', 11), { mode: 'approve' }).ok).toBeDefined(); // far Saturday
    expect(times(at('2030-01-06', 12), at('2030-01-06', 13), { mode: 'approve' }))
      .toEqual({ error: 'This request is for a time that has already started', status: 400 });
  });

  test('RULES are the documented ones', () => {
    expect(RULES).toEqual({ OPEN_HOUR: 8, CLOSE_HOUR: 20, MAX_HOURS: 4, WINDOW_DAYS: 7 });
    expect([isStaff('ADMIN'), isStaff('FACULTY'), isStaff('STUDENT_REP'), isStaff('VIEWER')]).toEqual([true, true, false, false]);
  });
});

describe('checkRoom', () => {
  const room = (o = {}) => ({ id: 1, name: 'R', type: 'Lecture Room', is_active: true, student_access: true, ...o });
  test.each([
    ['missing room', null, 'STUDENT_REP', 404],
    ['inactive room', room({ is_active: false }), 'ADMIN', 404],
    ['Committee Room, student', room({ type: 'Committee Room' }), 'STUDENT_REP', 403],
    ['Auditorium, student', room({ type: 'Auditorium' }), 'VIEWER', 403],
    ['student_access=false, student', room({ student_access: false }), 'STUDENT_REP', 403],
  ])('%s → %s', (_n, r, role, status) => {
    expect(checkRoom(r, role)).toMatchObject({ status });
  });
  test.each([
    ['Committee Room, faculty', room({ type: 'Committee Room' }), 'FACULTY'],
    ['Auditorium, admin', room({ type: 'Auditorium' }), 'ADMIN'],
    ['student_access=false, faculty', room({ student_access: false }), 'FACULTY'],
    ['plain room, student', room(), 'STUDENT_REP'],
  ])('%s → allowed', (_n, r, role) => {
    expect(checkRoom(r, role)).toBeNull();
  });
});

describe('timetable time arithmetic', () => {
  test.each([['08:00', 480], ['12:30', 750], ['01:00', 780], ['07:45', 19 * 60 + 45], ['garbage', null]])('timetableMinutes(%s) = %s', (t, m) => {
    expect(timetableMinutes(t)).toBe(m);
  });
  test.each([
    ['10:00-11:00', 600, 660, true],
    ['10:00-11:00', 660, 720, false], // adjacent
    ['10:30-11:30', 660, 720, true], // half-hour overlap (BKG-13)
    ['12:00-01:00', 780, 840, false], // 12:00-13:00 vs 13:00-14:00
    ['12:00-01:00', 720, 780, true],
    ['02:00-03:00', 840, 900, true], // 14:00 IST in 12-hour data
    ['02:00-03:00', 120, 180, false],
    ['bad', 600, 660, false],
  ])('slotOverlaps(%s, %i, %i) = %s', (slot, s, e, expected) => {
    expect(slotOverlaps(slot, s, e)).toBe(expected);
  });
  test.each([
    ['2030-01-09', 'Mon', '2030-01-07'],
    ['2030-01-09', 'Sat', '2030-01-12'],
    ['2030-01-13', 'Mon', '2030-01-07'], // Sunday belongs to the week that started on Monday
    ['2030-01-07', 'Sun', '2030-01-13'],
    ['2030-01-07', 'Funday', null],
  ])('dateInSameWeek(%s, %s) = %s', (date, day, expected) => {
    expect(dateInSameWeek(date, day)).toBe(expected);
  });
});

describe('constraintConflict (lost races become 409s)', () => {
  test.each([
    ['bookings_no_room_overlap', 'room_booked'],
    ['bookings_no_person_overlap', 'person_busy'],
    ['bookings_no_faculty_overlap', 'faculty_busy'],
  ])('23P01 on %s → 409 %s', (constraint, type) => {
    expect(constraintConflict({ code: '23P01', constraint })).toMatchObject({ status: 409, conflict: { type } });
  });
  test('other errors are not conflicts', () => {
    expect(constraintConflict({ code: '23P01', constraint: 'other' })).toMatchObject({ status: 409 });
    expect(constraintConflict({ code: '22P02' })).toBeNull();
    expect(constraintConflict(null)).toBeNull();
  });

  // Two transactions inserting rows that conflict on an exclusion constraint at the same moment can
  // deadlock (each waits for the other's uncommitted row). Postgres aborts one with 40P01, which
  // bookingService.inTransaction rethrows → 500. Seen in __tests__/bookings/concurrency.test.js
  // ("same student, N rooms, overlapping PENDING requests in parallel") in roughly 1 run in 6.
  test.failing('[NEW-P4-7] a deadlock between two racing bookings (40P01) is reported as a 409 conflict', () => {
    expect(constraintConflict({ code: '40P01' })).toMatchObject({ status: 409 });
  });

  // Same-start races hit the pre-v26 partial unique indexes idx_room_slot_active / idx_user_slot_active
  // (23505) before the exclusion constraint; they fall through to the generic mapper: 409 "That already
  // exists." with no conflict body, unlike every other room/person conflict.
  test.failing('[NEW-P4-8] a same-start race on the legacy unique index (23505 idx_room_slot_active) → 409 room_booked', () => {
    expect(constraintConflict({ code: '23505', constraint: 'idx_room_slot_active' })).toMatchObject({ status: 409, conflict: { type: 'room_booked' } });
  });
});

describe('formatIstRange (notification emails)', () => {
  test('formats the IST date and hour range regardless of server TZ', () => {
    const r = formatIstRange(at('2030-01-07', 9), at('2030-01-07', 11));
    expect(r.time).toBe('09:00 – 11:00');
    expect(r.date).toMatch(/^Mon, 7 Jan,? 2030$/); // the comma before the year depends on the ICU version
    expect(formatIstRange('2030-01-07T13:30:00.000Z', '2030-01-07T14:30:00.000Z').time).toBe('19:00 – 20:00');
  });
});

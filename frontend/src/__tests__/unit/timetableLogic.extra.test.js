import { describe, it, expect, vi, beforeAll } from 'vitest';
import {
  getDayOfWeek, getHourFromTime, getSortableMinutes, formatTo24h,
  getMergedSchedule, isRoomReallyFree, getClassConflict,
} from '../../utils/timetableLogic';

// Booking instants are UTC ISO strings; the module maps them to IST via utils/timezone, so these
// tests are independent of the container TZ (UTC). 2026-10-20 is a Tuesday.
const TUE = '2026-10-20';
const at = (date, h) => new Date(Date.UTC(...date.split('-').map((n, i) => (i === 1 ? n - 1 : +n)), h) - 330 * 60000).toISOString();

beforeAll(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });

const student = { id: 7, role: 'STUDENT_REP', branch: 'IT', section: 2, semester: 5 };
const faculty = { id: 21, faculty_id: 500021, role: 'FACULTY' };

const slot = (over = {}) => ({
  day_of_week: 'Tuesday', slot_time: '09:00-10:00', subject_name: 'DBMS', room_name: 'R-101',
  faculty_name: 'Dr X', department: 'IT', semester: 5, section: 2, ...over,
});

describe('timetableLogic primitives', () => {
  it('getDayOfWeek accepts Date objects and ISO datetimes', () => {
    expect(getDayOfWeek(new Date(2026, 9, 20, 12))).toBe('Tue');
    expect(getDayOfWeek('2026-10-25')).toBe('Sun');
  });
  it('12h heuristic: 1..7 => PM, 8..12 => AM/noon; garbage => 0', () => {
    expect(getHourFromTime('08:00-09:00')).toBe(8);
    expect(getHourFromTime('07:00-08:00')).toBe(19);
    expect(getHourFromTime('')).toBe(0);
    expect(getHourFromTime('TBA')).toBe(0);
    expect(getSortableMinutes('03:15-04:15')).toBe(15 * 60 + 15);
    expect(formatTo24h('')).toBe('');
    expect(formatTo24h('TBA')).toBe('TBA');
  });
});

describe('getMergedSchedule', () => {
  it('returns [] without user and on weekends', () => {
    expect(getMergedSchedule(null, TUE)).toEqual([]);
    expect(getMergedSchedule(student, '2026-10-24', [], [], [slot({ day_of_week: 'Saturday' })])).toEqual([]);
  });

  it('student: picks static slots for the weekday, sorted with 24h displayTime', () => {
    const tt = [slot({ slot_time: '02:00-03:00', subject_name: 'OS' }), slot(), slot({ day_of_week: 'Monday', subject_name: 'NO' })];
    const out = getMergedSchedule(student, TUE, [], [], tt);
    expect(out.map((s) => [s.subjectName, s.displayTime, s.className])).toEqual([
      ['DBMS', '09:00 - 10:00', 'IT Sem 5 · Sec 2'],
      ['OS', '14:00 - 15:00', 'IT Sem 5 · Sec 2'],
    ]);
  });

  it('student: non-array timetable data yields []', () => {
    expect(getMergedSchedule(student, TUE, [], [], {})).toEqual([]);
  });

  it('student: removes static class freed by an availability override (date or weekday)', () => {
    const freedByDate = [{ room_name: 'r-101 ', day: TUE, hour: 9, is_available: true }];
    const freedByDay = [{ room_name: 'R-101', day: 'Tue', hour: '9', is_available: true }];
    const blocked = [{ room_name: 'R-101', day: TUE, hour: 9, is_available: false }];
    expect(getMergedSchedule(student, TUE, [], freedByDate, [slot()])).toHaveLength(0);
    expect(getMergedSchedule(student, TUE, [], freedByDay, [slot()])).toHaveLength(0);
    expect(getMergedSchedule(student, TUE, [], blocked, [slot()])).toHaveLength(1);
  });

  it('student: merges own-section ACTIVE bookings on that IST date (branch aliases normalised)', () => {
    const bookings = [
      { id: 1, start_time: at(TUE, 14), end_time: at(TUE, 15), status: 'ACTIVE', branch: 'Information Technology', section: 2, year: 3, room_name: 'R-202', purpose: 'Extra' },
      { id: 2, start_time: at(TUE, 15), end_time: at(TUE, 16), status: 'CANCELLED', branch: 'IT', section: 2, year: 3, room_name: 'R-203' },
      { id: 3, start_time: at(TUE, 16), end_time: at(TUE, 17), status: 'ACTIVE', branch: 'IT', section: 1, year: 3, room_name: 'R-204' },
      { id: 4, start_time: at('2026-10-21', 9), end_time: at('2026-10-21', 10), status: 'ACTIVE', branch: 'IT', section: 2, year: 3 },
    ];
    const out = getMergedSchedule(student, TUE, bookings, [], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ bookingId: 1, isDynamic: true, time: '14:00-15:00', displayTime: '14:00 - 15:00', room: 'R-202', subjectName: 'Extra' });
  });

  it('booking at 00:30 IST belongs to that IST day, not the previous UTC day', () => {
    const b = { id: 9, start_time: '2026-10-19T19:00:00.000Z', end_time: '2026-10-19T20:00:00.000Z', status: null, branch: 'IT', section: 2, year: 3 };
    expect(getMergedSchedule(student, TUE, [b], [], [])).toHaveLength(1);
    expect(getMergedSchedule(student, '2026-10-19', [b], [], [])).toHaveLength(0);
  });

  it('faculty: uses facultyTimetableData, own/created bookings, and drops cancelled overrides', () => {
    const fData = { Tue: [{ slot_time: '10:00-11:00', subject_name: 'AI', room_name: 'R-1', department: 'IT', semester: 5, section: 1 }, { slot_time: '11:00-12:00', content: 'Lab' }] };
    const bookings = [
      { id: 5, faculty_id: 500021, start_time: at(TUE, 13), end_time: at(TUE, 14), status: 'ACTIVE', room_name: 'R-9' },
      // faculty_id equal to the user id (not the directory id) must not count as "mine"
      { id: 7, faculty_id: 21, start_time: at(TUE, 16), end_time: at(TUE, 17), status: 'ACTIVE', room_name: 'R-8' },
      { id: 6, faculty_id: 99, created_by: 99, start_time: at(TUE, 15), end_time: at(TUE, 16), status: 'ACTIVE' },
    ];
    const overrides = [{ date: '2026-10-20T00:00:00.000Z', hour: 11, is_cancelled: true }];
    const out = getMergedSchedule(faculty, TUE, bookings, [], [], fData, overrides);
    expect(out.map((s) => s.subjectName)).toEqual(['AI', 'Rescheduled Class']);
    expect(out[0].className).toBe('IT Sem 5 · Sec 1');
  });

  it('dedupes identical subject+room+time entries', () => {
    const out = getMergedSchedule(student, TUE, [], [], [slot(), slot()]);
    expect(out).toHaveLength(1);
  });
});

describe('isRoomReallyFree', () => {
  const room = { id: 3, name: 'R-101' };
  const ttArr = [{ timetable: { Tue: [{ time: '09:00-10:00', room: 'R-101' }] } }];

  it('false without a room', () => expect(isRoomReallyFree(null, TUE, 'Tue', 9)).toBe(false));
  it('free when nothing is scheduled', () => expect(isRoomReallyFree(room, TUE, 'Tue', 9)).toBe(true));
  it('blocked by static timetable (array form and object form)', () => {
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, [], [], ttArr)).toBe(false);
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, [], [], { Tue: [{ time: '09:00-10:00', room: 'r-101' }] })).toBe(false);
    expect(isRoomReallyFree(room, TUE, 'Tue', 10, [], [], ttArr)).toBe(true);
  });
  it('date-specific override beats weekday override', () => {
    const av = [
      { room_name: 'R-101', day: 'Tue', hour: 9, is_available: false },
      { room_name: 'R-101', day: TUE, hour: 9, is_available: true },
    ];
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, [], av, ttArr)).toBe(true);
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, [], [av[0]], [])).toBe(false);
  });
  it('blocked by ACTIVE/PENDING/CONFIRMED booking on that IST date+hour, not by CANCELLED', () => {
    const mk = (status) => [{ room_id: 3, start_time: at(TUE, 9), status }];
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, mk('ACTIVE'))).toBe(false);
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, mk('pending'))).toBe(false);
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, mk('CONFIRMED'))).toBe(false);
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, mk(undefined))).toBe(false);
    expect(isRoomReallyFree(room, TUE, 'Tue', 9, mk('CANCELLED'))).toBe(true);
    expect(isRoomReallyFree({ id: 4, name: 'R-102' }, TUE, 'Tue', 9, mk('ACTIVE'))).toBe(true);
  });

  // NEW-FE-1: static-schedule matching uses substring `includes`, so room "101" is reported busy
  // whenever *any* room whose name contains "101" (e.g. "1101") has a class.
  it.fails('[NEW-FE-1] room "101" is not blocked by a class in room "1101"', () => {
    const tt = [{ timetable: { Tue: [{ time: '09:00-10:00', room: '1101' }] } }];
    expect(isRoomReallyFree({ id: 8, name: '101' }, TUE, 'Tue', 9, [], [], tt)).toBe(true);
  });
});

describe('getClassConflict', () => {
  it('finds a static class covering the hour, ignores others', () => {
    const tt = [slot({ slot_time: '02:00-04:00', subject_name: 'Lab' })];
    expect(getClassConflict(student, TUE, 14, [], [], tt)?.subjectName).toBe('Lab');
    expect(getClassConflict(student, TUE, 15, [], [], tt)?.subjectName).toBe('Lab');
    expect(getClassConflict(student, TUE, 16, [], [], tt)).toBeUndefined();
    expect(getClassConflict(student, TUE, 13, [], [], tt)).toBeUndefined();
  });
});

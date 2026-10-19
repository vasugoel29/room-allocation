import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RoomScheduleGrid from '../../pages/RoomScheduleGrid';
import { installFetch, fetchCalls } from '../utils/http';
import { useIST, ist } from '../utils/ist';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import { toast } from 'react-hot-toast';

// FE-01 only manifests east of UTC: the grid builds local-midnight Dates and serialises them with
// toISOString(). In the UTC container it would look correct, so this file runs the worker in IST.
// Clock: Wed 2026-10-21 10:00 IST → current week Mon 2026-10-19 .. Fri 2026-10-23.
useIST();

const ROOMS = [{ id: 4, name: 'R-4', building: '5th Block', capacity: 60 }, { id: 5, name: 'L-5', building: 'APJ', capacity: 30 }];
const SCHEDULE = {
  timetableBlocks: [{ day: 'tue', hour: 9, subject: 'DBMS', faculty: 'Dr X' }, { day: 'wed', hour: 11, subject: 'OS', faculty: 'Dr Y' }],
  bookings: [
    { start_time: ist(2026, 10, 19, 14).toISOString(), end_time: ist(2026, 10, 19, 16).toISOString(), purpose: 'Seminar', bookerName: 'Ann' },
    // Same clash on both candidate dates so the Wednesday conflict cell renders whether or not FE-01 shifts rows.
    { date: '2026-10-20', startHour: 11, endHour: 12, purpose: 'Clash', bookerName: 'Bob' },
    { date: '2026-10-21', startHour: 11, endHour: 12, purpose: 'Clash', bookerName: 'Bob' },
  ],
};

const setup = (routes = []) => {
  const f = installFetch([
    ...routes,
    ['GET', /\/api\/rooms\?/, ROOMS],
    ['GET', /\/week-schedule/, SCHEDULE],
    ['GET', /\/conflict-check/, { hasConflict: false, conflicts: [] }],
    ['POST', '/api/bookings/admin/quick', { id: 1 }],
    ['PATCH', /\/cancel$/, { ok: true }],
    ['DELETE', /\/api\/timetable\/slots\//, { ok: true }],
  ]);
  render(<RoomScheduleGrid />);
  return { f, ue: userEvent.setup() };
};
const row = (day) => screen.getByText(day).closest('.grid');
const freeCells = (day) => Array.from(row(day).querySelectorAll('.cursor-pointer.border-dashed'));
const weekStarts = (f) => fetchCalls(f).filter(([, u]) => u.includes('week-schedule')).map(([, u]) => u.split('weekStart=')[1]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist(2026, 10, 21, 10));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('RoomScheduleGrid', () => {
  it('selects the first room and loads its week schedule', async () => {
    const { f } = setup();
    expect(await screen.findByText('Room R-4 (5th Block)')).toBeInTheDocument();
    await waitFor(() => expect(weekStarts(f)).toHaveLength(1));
    expect(fetchCalls(f).find(([, u]) => u.includes('week-schedule'))[1]).toMatch(/^\/api\/rooms\/4\/week-schedule\?weekStart=/);
  });

  it('renders timetable, booking (multi-hour) and conflict cells', async () => {
    setup();
    expect(await screen.findByTitle('Dr X: DBMS')).toBeInTheDocument();
    expect(screen.getAllByTitle('Booked by Ann: Seminar')).toHaveLength(2); // 14:00 and 15:00
    expect(screen.getByTitle('Conflict detected! Click to resolve.')).toBeInTheDocument(); // OS + Clash on Wed 11
  });

  it('room picker searches by name/building and switches room', async () => {
    const { f, ue } = setup();
    await ue.click(await screen.findByText('Room R-4 (5th Block)'));
    await ue.type(screen.getByPlaceholderText('Search room name or building...'), 'apj');
    expect(screen.queryByText(/Room R-4 ·/)).toBeNull();
    await ue.click(screen.getByText(/Room L-5 · APJ/));
    await waitFor(() => expect(fetchCalls(f).some(([, u]) => u.startsWith('/api/rooms/5/week-schedule'))).toBe(true));
  });

  it('prev/next move the requested week by exactly 7 days; Today returns', async () => {
    const { f, ue } = setup();
    await waitFor(() => expect(weekStarts(f)).toHaveLength(1));
    const buttons = screen.getAllByRole('button');
    await ue.click(buttons[1]); // next
    await waitFor(() => expect(weekStarts(f)).toHaveLength(2));
    await ue.click(buttons[0]); // prev
    await ue.click(buttons[0]); // prev
    await waitFor(() => expect(weekStarts(f)).toHaveLength(4));
    const [w0, w1, , w3] = weekStarts(f).map((d) => new Date(`${d}T00:00:00Z`).getTime());
    expect((w1 - w0) / 864e5).toBe(7);
    expect((w0 - w3) / 864e5).toBe(7);
    await ue.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(weekStarts(f).at(-1)).toBe(weekStarts(f)[0]));
  });

  it('clicking a free cell opens the drawer and runs the conflict check', async () => {
    const { f, ue } = setup();
    await screen.findByTitle('Dr X: DBMS');
    await ue.click(freeCells('Thursday')[2]); // 10:00
    expect(await screen.findByText('Create Booking')).toBeInTheDocument();
    expect(screen.getByText('10:00 - 11:00')).toBeInTheDocument();
    await waitFor(() => expect(fetchCalls(f).some(([, u]) => u.includes('/api/rooms/4/conflict-check?') && u.includes('startHour=10&endHour=11'))).toBe(true));
    expect(await screen.findByText(/slot is free/i)).toBeInTheDocument();
  });

  it('purpose is required', async () => {
    const { f, ue } = setup();
    await screen.findByTitle('Dr X: DBMS');
    await ue.click(freeCells('Thursday')[2]);
    await screen.findByText(/slot is free/i);
    fireEvent.submit(screen.getByRole('button', { name: /confirm booking/i }).closest('form'));
    expect(toast.error).toHaveBeenCalledWith('Booking purpose is required');
    expect(fetchCalls(f).some(([m]) => m === 'POST')).toBe(false);
  });

  it('conflicts disable Confirm and can be resolved (booking → cancel, timetable → delete slot)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { f, ue } = setup([['GET', /\/conflict-check/, { hasConflict: true, conflicts: [
      { type: 'timetable', subject: 'OS', faculty: 'Dr Y', slotId: 31 },
      { type: 'booking', purpose: 'Clash', booker: 'Bob', bookingId: 77 },
    ] }]]);
    await ue.click(await screen.findByTitle('Conflict detected! Click to resolve.'));
    expect(await screen.findByText('Conflict Detected!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm booking/i })).toBeDisabled();
    const [delSlot, cancelBk] = screen.getAllByTitle('Resolve conflict');
    await ue.click(delSlot);
    await ue.click(cancelBk);
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/bookings/77/cancel', undefined]));
    expect(fetchCalls(f)).toContainEqual(['DELETE', '/api/timetable/slots/31', undefined]);
  });

  it('submits the booking and closes the drawer on success', async () => {
    const { f, ue } = setup();
    await screen.findByTitle('Dr X: DBMS');
    await ue.click(freeCells('Thursday')[2]);
    await screen.findByText(/slot is free/i);
    await ue.type(screen.getByPlaceholderText(/guest lecture/i), 'Guest talk');
    await ue.click(screen.getByRole('button', { name: /confirm booking/i }));
    await waitFor(() => expect(fetchCalls(f).some(([m]) => m === 'POST')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Create Booking')).toBeNull());
  });

  // ---- Known bugs -------------------------------------------------------------------------------
  // FE-01: getMonday() returns Mon 00:00 IST, formatDateISO() = toISOString() → "2026-10-18" (Sunday).
  it('[FE-01] requests weekStart = Monday 2026-10-19 in IST', async () => {
    const { f } = setup();
    await waitFor(() => expect(weekStarts(f)).toHaveLength(1));
    expect(weekStarts(f)[0]).toBe('2026-10-19');
  });

  it('[FE-01] the Monday row maps to date 2026-10-19 (drawer + conflict check)', async () => {
    const { f, ue } = setup();
    await screen.findByTitle('Dr X: DBMS');
    await ue.click(freeCells('Monday')[0]); // 08:00
    expect(await screen.findByText('Create Booking')).toBeInTheDocument();
    expect(screen.getByText('2026-10-19')).toBeInTheDocument();
    expect(fetchCalls(f).some(([, u]) => u.includes('date=2026-10-19&startHour=8'))).toBe(true);
  });

  it('[FE-01] a Monday 14:00 IST booking is drawn in the Monday row', async () => {
    setup();
    await screen.findByTitle('Dr X: DBMS');
    expect(within(row('Monday')).queryAllByTitle('Booked by Ann: Seminar')).toHaveLength(2);
  });

  // FE-02: Confirm Booking posts {room_id,start_time,end_time,purpose}; /bookings/admin/quick requires
  // {room_name,date,slot} (see adminService.quickBook / useAdminQuickBook) → always 400.
  it('[FE-02] Confirm Booking sends the quick-book contract {room_name, date, slot, purpose}', async () => {
    const { f, ue } = setup();
    await screen.findByTitle('Dr X: DBMS');
    await ue.click(freeCells('Thursday')[2]); // 10:00
    await screen.findByText(/slot is free/i);
    await ue.type(screen.getByPlaceholderText(/guest lecture/i), 'Guest talk');
    await ue.click(screen.getByRole('button', { name: /confirm booking/i }));
    await waitFor(() => expect(fetchCalls(f).some(([m]) => m === 'POST')).toBe(true));
    const body = fetchCalls(f).find(([m]) => m === 'POST')[2];
    expect(body).toMatchObject({ room_name: 'R-4', slot: 10, purpose: 'Guest talk' });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // NEW-FE-4: header range reads weekDates[5] but only 5 dates (Mon–Fri, indices 0–4) exist → end date missing.
  it('[NEW-FE-4] week header shows the end date of the range', async () => {
    setup();
    await screen.findByTitle('Dr X: DBMS');
    expect(screen.getByText(/–/).textContent).toMatch(/Oct 19\s*–\s*Oct 23, 2026/);
  });
});

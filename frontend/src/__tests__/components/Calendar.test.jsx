import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Calendar from '../../components/ui/Calendar';
import { AppProvider } from '../../context/AppContext';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch } from '../utils/http';
import { getIstDateKey } from '../../utils/timezone';
import { runInIST, ist } from '../utils/ist';

// Calendar computes "today"/week days with local Date methods; users are in IST, the container is UTC,
// so the worker is switched to IST and the clock pinned to Mon 2026-10-19 09:00 IST.
runInIST();

const ROOMS = [
  { id: 1, name: 'R-1', floor: 0, capacity: 60, has_ac: true, has_projector: true, type: 'Lecture Room' },
  { id: 2, name: 'R-2', floor: 1, capacity: 40, has_ac: false, has_projector: true, type: 'Lecture Room' },
  { id: 3, name: 'R-3', floor: 1, capacity: 30, has_ac: false, has_projector: false, type: 'Lab' },
  { id: 4, name: 'STAFF-1', floor: 2, capacity: 10, student_access: false, type: 'Committee Room' },
];
// R-2 booked Tue 10:00 IST; R-3 has a timetable class Tue 09:00 (a 'class' row of /availability).
const BOOKINGS = [{ id: 50, room_id: 2, start_time: '2026-10-20T04:30:00.000Z', status: 'ACTIVE', class_name: 'IT-2' }];
const CLASS_R3 = { room_id: 3, room_name: 'R-3', day: 'Tue', hour: 9, is_available: false, source: 'class' };

const setup = (ctx = {}) => {
  const onSlotClick = vi.fn();
  const r = renderWithContext(<Calendar onSlotClick={onSlotClick} />, {
    ctx: { user: USERS.STUDENT_REP, rooms: ROOMS, bookings: BOOKINGS, availability: [CLASS_R3], selectedDay: '2026-10-20', viewMode: 'day', ...ctx },
  });
  return { ...r, onSlotClick };
};
const cards = (title) => screen.queryAllByTitle(title);

beforeEach(() => {
  window.innerWidth = 1280;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist(2026, 10, 19, 9));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Calendar room cards', () => {
  it('free rooms appear in every bookable hour 08..17 of a future day (the hours the server accepts)', () => {
    setup();
    expect(cards('R-1 - Available')).toHaveLength(10);
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getAllByText('17:00').length).toBeGreaterThan(0);
  });

  it('booked room shows a booked card only at its IST hour', () => {
    setup();
    expect(cards('R-2 - Booked for IT-2')).toHaveLength(1);
    expect(cards('R-2 - Available')).toHaveLength(9);
  });

  it('timetable-occupied room is hidden at that hour', () => {
    setup();
    expect(cards('R-3 - Available')).toHaveLength(9);
  });

  it('a 2-hour booking takes both hours (as on the server)', () => {
    setup({ bookings: [{ id: 51, room_id: 1, start_time: '2026-10-20T04:30:00.000Z', end_time: '2026-10-20T06:30:00.000Z', status: 'ACTIVE', class_name: 'IT-3' }] });
    expect(cards('R-1 - Available')).toHaveLength(8);
  });

  it('date-specific availability override re-shows the timetable-occupied room', () => {
    setup({ availability: [CLASS_R3, { room_id: 3, room_name: 'R-3', day: '2026-10-20', hour: 9, is_available: true, source: 'release' }] });
    expect(cards('R-3 - Available')).toHaveLength(10);
  });

  it('a blocking override hides an otherwise free room', () => {
    setup({ availability: [CLASS_R3, { room_id: 1, room_name: 'R-1', day: 'Tue', hour: 11, is_available: false, source: 'block' }] });
    expect(cards('R-1 - Available')).toHaveLength(9);
  });

  it('student_access=false rooms are hidden from students but shown to admins', () => {
    setup();
    expect(cards('STAFF-1 - Available')).toHaveLength(0);
  });
  it('...shown to admins', () => {
    setup({ user: USERS.ADMIN });
    expect(cards('STAFF-1 - Available')).toHaveLength(10);
  });

  it('clicking a free card reports day/hour/date/room_id', () => {
    const { onSlotClick } = setup();
    fireEvent.click(cards('R-1 - Available')[2]); // 10:00
    expect(onSlotClick).toHaveBeenCalledTimes(1);
    const arg = onSlotClick.mock.calls[0][0];
    expect(arg).toMatchObject({ day: 'Tue', hour: 10, room_id: 1 });
    expect(getIstDateKey(arg.date)).toBe('2026-10-20'); // the clicked IST calendar day
  });

  it('clicking a booked card passes the booking', () => {
    const { onSlotClick } = setup();
    fireEvent.click(cards('R-2 - Booked for IT-2')[0]);
    expect(onSlotClick.mock.calls[0][0]).toMatchObject({ hour: 10, room_id: 2, booking: { id: 50 } });
  });

  it('booked card tooltip includes faculty when present', () => {
    setup({ bookings: [{ id: 52, room_id: 2, start_time: '2026-10-20T04:30:00.000Z', status: 'ACTIVE', class_name: 'IT-2', faculty_name: 'Dr Sharma' }] });
    expect(cards('R-2 - Booked for IT-2 (Faculty: Dr Sharma)')).toHaveLength(1);
  });

  it('viewers cannot click room cards to open modal and cards have cursor-default', () => {
    const { onSlotClick } = setup({ user: USERS.VIEWER });
    const availableCards = cards('R-1 - Available');
    expect(availableCards[0]).toHaveAttribute('aria-disabled', 'true');
    expect(availableCards[0].className).toContain('cursor-default');
    fireEvent.click(availableCards[0]);
    expect(onSlotClick).not.toHaveBeenCalled();

    const bookedCards = cards('R-2 - Booked for IT-2');
    expect(bookedCards[0]).toHaveAttribute('aria-disabled', 'true');
    expect(bookedCards[0].className).toContain('cursor-default');
    fireEvent.click(bookedCards[0]);
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('today (IST) only shows the current and later hours', () => {
    vi.setSystemTime(ist(2026, 10, 19, 13, 30));
    setup({ selectedDay: '2026-10-19' });
    expect(cards('R-1 - Available')).toHaveLength(5); // 13..17
  });

  it('empty room list shows the empty state', () => {
    setup({ rooms: [] });
    expect(screen.getByText('No structural matches found')).toBeInTheDocument();
  });

  it('week view renders Mon..Fri of the current IST week; clicking a day switches to day view', () => {
    const { ctx } = setup({ viewMode: 'week' });
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) expect(screen.getByRole('heading', { name: new RegExp(`^${d}`) })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Wed/ })).toHaveTextContent('Oct 21');
    fireEvent.click(screen.getByRole('heading', { name: /^Wed/ }));
    expect(ctx.setSelectedDay).toHaveBeenCalledWith('2026-10-21');
    expect(ctx.setViewMode).toHaveBeenCalledWith('day');
  });

  it('on Saturday the week view shows next Mon..Fri', () => {
    vi.setSystemTime(ist(2026, 10, 24, 10));
    setup({ viewMode: 'week' });
    expect(screen.getByRole('heading', { name: /^Mon/ })).toHaveTextContent('Oct 26');
  });

  it('mobile collapses to 3 cards + "+N More" and expands', () => {
    window.innerWidth = 400;
    const many = Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, name: `M-${i}`, floor: 0, capacity: 10 }));
    setup({ rooms: many, bookings: [], timetableData: {} });
    const more = screen.getAllByRole('button', { name: /\+3 more/i });
    expect(more).toHaveLength(10);
    fireEvent.click(more[0]);
    expect(screen.getAllByRole('button', { name: /show less/i })).toHaveLength(1);
  });
});

describe('Calendar filters (applied from AppContext.filters)', () => {
  const f = (over) => ({ smartRoom: false, searchTerm: '', floor: 'all', building: ['all'], roomType: 'all', ...over });

  it.each([
    ['searchTerm', f({ searchTerm: 'r-1' }), ['R-1']],
    ['floor G = 0', f({ floor: 'G' }), ['R-1']],
    ['floor 1', f({ floor: '1' }), ['R-2', 'R-3']],
    ['smartRoom (AC + projector)', f({ smartRoom: true }), ['R-1']],
    ['roomType Lab', f({ roomType: 'Lab' }), ['R-3']],
  ])('%s', (_l, filters, visible) => {
    setup({ filters, bookings: [], timetableData: {} });
    for (const name of ['R-1', 'R-2', 'R-3']) {
      expect(cards(`${name} - Available`).length > 0).toBe(visible.includes(name));
    }
  });
});

describe('Calendar known bugs', () => {
  // FE-09: the whole cell is clickable and opens the booking modal without a room → "Please select a room".
  it('[FE-09] clicking empty space in a cell does not open the modal without a room', () => {
    const { onSlotClick } = setup();
    const cell = cards('R-1 - Available')[0].parentElement.parentElement;
    fireEvent.click(cell);
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  // FE-07: room cards are <div onClick>, not focusable/operable by keyboard.
  it('[FE-07] room cards are exposed as buttons', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /R-1/ }).length).toBeGreaterThan(0);
  });

  // FE-13: a failed /rooms fetch is only console-logged; the grid claims there are no matching rooms.
  it('[FE-13] a failed rooms fetch is not presented as "No structural matches found"', async () => {
    vi.useRealTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('user', JSON.stringify(USERS.VIEWER));
    const fm = installFetch([['GET', '/api/health', { ok: 1 }], ['GET', /\/api\/rooms\?/, () => new Response('{}', { status: 500 })]]);
    render(<MemoryRouter><AppProvider><Calendar onSlotClick={() => {}} /></AppProvider></MemoryRouter>);
    await waitFor(() => expect(fm.mock.calls.some(([u]) => u.startsWith('/api/rooms'))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('No structural matches found')).toBeNull();
    localStorage.clear();
  });
});

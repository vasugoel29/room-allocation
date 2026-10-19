import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryView from '../../features/history/HistoryView';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';
import { runInIST, ist } from '../utils/ist';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

// Today/This-week ranges use local Date math → run in IST with the clock at Wed 2026-10-21 10:00 IST.
runInIST();

const REP = USERS.STUDENT_REP;
const b = (id, day, h, over = {}) => ({
  id, room_name: `R-${id}`, start_time: ist(2026, 10, day, h).toISOString(), end_time: ist(2026, 10, day, h + 1).toISOString(),
  status: 'ACTIVE', created_by: REP.id, class_name: 'IT-2', purpose: `purpose ${id}`, ...over,
});
const BOOKINGS = [
  b(1, 21, 14),                      // today, upcoming
  b(2, 22, 9),                       // this week
  b(3, 21, 8, { status: 'PENDING' }), // today, already ended
  b(4, 14, 9),                       // last week (past)
  b(5, 21, 15, { created_by: 999 }), // someone else's
  b(6, 23, 11, { status: 'CANCELLED' }),
];

const setup = ({ user = REP, ctx = {}, routes = [] } = {}) => {
  const f = installFetch([
    ...routes, // first match wins
    ['GET', '/api/availability/my', []],
    ['PATCH', /\/api\/bookings\/\d+\/cancel/, { ok: true }],
    ['PATCH', /\/api\/transfers\/\d+\/(accept|reject)/, { ok: true }],
  ]);
  const r = renderWithContext(<HistoryView />, { ctx: { user, bookings: BOOKINGS, ...ctx } });
  return { ...r, f, ue: userEvent.setup() };
};
const tableRooms = () => {
  const table = screen.queryByRole('table');
  if (!table) return [];
  return within(table).getAllByRole('row').slice(1).map((r) => within(r).getByText(/^R-\d+$/).textContent);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist(2026, 10, 21, 10));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('HistoryView tabs', () => {
  it('This Week (default): own ACTIVE/PENDING/CANCELLED bookings in Mon..Sun, newest first', () => {
    setup();
    expect(tableRooms()).toEqual(['R-6', 'R-2', 'R-1', 'R-3']);
  });

  it('Today: only bookings on the IST day', async () => {
    const { ue } = setup();
    await ue.click(screen.getByRole('button', { name: 'Today' }));
    expect(tableRooms()).toEqual(['R-1', 'R-3']);
  });

  it('Past: anything that already ended', async () => {
    const { ue } = setup();
    await ue.click(screen.getByRole('button', { name: 'Past' }));
    expect(tableRooms()).toEqual(['R-3', 'R-4']);
  });

  it('admins see everyone\'s bookings', () => {
    setup({ user: USERS.ADMIN });
    expect(tableRooms()).toContain('R-5');
    expect(screen.getByText('Allocation Registry')).toBeInTheDocument();
  });

  it('search filters by room/class/purpose', async () => {
    const { ue } = setup();
    await ue.type(screen.getByPlaceholderText('Search bookings...'), 'purpose 2');
    expect(tableRooms()).toEqual(['R-2']);
  });

  it('empty state', async () => {
    setup({ ctx: { bookings: [] } });
    expect(screen.getByText('Timeline Empty')).toBeInTheDocument();
  });

  it('includes my availability overrides (non-viewers only)', async () => {
    setup({ routes: [['GET', '/api/availability/my', [{ id: 9, room_name: 'R-9', day: '2026-10-22', hour: 11, user_id: REP.id, is_available: true }]]] });
    await waitFor(() => expect(tableRooms()).toContain('R-9'));
    expect(screen.getAllByText('Manual Override').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Freed').length).toBeGreaterThan(0);
  });

  it('viewer does not request overrides', () => {
    const { f } = setup({ user: USERS.VIEWER, ctx: { bookings: [] } });
    expect(f).not.toHaveBeenCalled();
  });

  it('paginates 5 per page', async () => {
    const many = Array.from({ length: 7 }, (_, i) => b(100 + i, 22, 8 + i));
    const { ue } = setup({ ctx: { bookings: many } });
    expect(tableRooms()).toHaveLength(5);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: 'Next' }));
    expect(tableRooms()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('Transfers tab: badge, incoming/outgoing lists, accept action', async () => {
    const incoming = [{ id: 31, room_name: 'R-31', start_time: b(0, 22, 9).start_time, requester_name: 'Bob', new_purpose: 'Quiz', status: 'PENDING' }];
    const outgoing = [{ id: 41, room_name: 'R-41', start_time: b(0, 22, 9).start_time, owner_name: 'Ann', status: 'REP2_ACCEPTED' }];
    const { ue, f, ctx } = setup({ ctx: { incomingTransfers: incoming, outgoingTransfers: outgoing, pendingTransferCount: 1 } });
    const tab = screen.getByRole('button', { name: /transfers/i });
    expect(tab).toHaveTextContent('1');
    await ue.click(tab);
    expect(screen.getByText(/From: Bob - Quiz/)).toBeInTheDocument();
    expect(screen.getByText(/To: Ann/)).toBeInTheDocument();
    expect(screen.getByText('Owner Accepted')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /accept/i }));
    await waitFor(() => expect(ctx.fetchTransfers).toHaveBeenCalled());
    expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/transfers/31/accept', undefined]);
    expect(ctx.fetchBookings).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Transfer accepted');
  });

  it('no accept/reject for a transfer whose booking was cancelled', async () => {
    const incoming = [{ id: 32, room_name: 'R-32', start_time: b(0, 22, 9).start_time, status: 'PENDING', booking_status: 'CANCELLED' }];
    const { ue } = setup({ ctx: { incomingTransfers: incoming } });
    await ue.click(screen.getByRole('button', { name: /transfers/i }));
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
  });
});

describe('HistoryView cancel', () => {
  const cancelButtonFor = (room) => within(screen.getByRole('table')).getByText(room).closest('tr').querySelector('td:last-child button');

  it('only own, ACTIVE, not-yet-ended bookings are cancellable', () => {
    setup();
    expect(cancelButtonFor('R-1')).not.toBeNull();
    expect(cancelButtonFor('R-2')).not.toBeNull();
    expect(cancelButtonFor('R-3')).toBeNull(); // pending & ended
    expect(cancelButtonFor('R-6')).toBeNull(); // cancelled
  });

  it('confirming cancels via PATCH and refreshes', async () => {
    const { ue, f, ctx } = setup();
    await ue.click(cancelButtonFor('R-1'));
    const dlg = screen.getByRole('dialog', { name: 'Cancel Booking' });
    await ue.click(within(dlg).getByRole('button', { name: 'Cancel Booking' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Booking cancelled'));
    expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/bookings/1/cancel', undefined]);
    expect(ctx.fetchBookings).toHaveBeenCalled();
    expect(ctx.fetchRooms).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dismissing the confirm does nothing', async () => {
    const { ue, f } = setup();
    await ue.click(cancelButtonFor('R-1'));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(fetchCalls(f).some(([m]) => m === 'PATCH')).toBe(false);
  });

  // FE-11: a failed cancel only sets an unused `error` state — the user gets no feedback at all.
  it.fails('[FE-11] a failed cancellation is reported to the user', async () => {
    const { ue } = setup({ routes: [['PATCH', /\/cancel$/, () => jsonResponse({ error: 'Cannot cancel a past booking' }, 400)]] });
    await ue.click(cancelButtonFor('R-1'));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Booking' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/bookings/1/cancel', expect.anything()));
    await new Promise((r) => setTimeout(r, 20));
    const shown = toast.error.mock.calls.length > 0 || screen.queryByText(/cannot cancel a past booking/i);
    expect(shown).toBeTruthy();
  });
});

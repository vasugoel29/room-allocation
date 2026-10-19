import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FacultyDashboard from '../../pages/FacultyDashboard';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';
import { runInIST, ist } from '../utils/ist';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

// Card dates/times are formatted in browser-local time → IST worker, clock at Wed 2026-10-21 10:00 IST.
runInIST();

const FAC = USERS.FACULTY;
const iso = (d, h) => ist(2026, 10, d, h).toISOString();
const PENDING = [{ id: 1, purpose: 'Extra DBMS', user_name: 'Rita Rep', room_name: 'R-1', start_time: iso(22, 10), end_time: iso(22, 11) }];
const TRANSFERS = [{ id: 7, requester_name: 'Bob', requestee_name: 'Ann', room_name: 'R-7', start_time: iso(23, 9), end_time: iso(23, 10) }];
const CANCELS = [{ id: 3, class_date: '2026-10-22', hour: 14, subject_name: 'AI', room_name: 'R-3' }];

const setup = ({ routes = [], bookings = [] } = {}) => {
  const f = installFetch([
    ...routes,
    ['GET', '/api/faculty/pending', PENDING],
    ['GET', '/api/transfers/incoming', TRANSFERS],
    ['GET', '/api/timetable/cancellation-requests/pending', CANCELS],
    ['GET', /\/api\/timetable\/faculty\/check\//, { isOccupied: false }],
    ['PATCH', /.*/, { message: 'done' }],
    ['POST', /.*/, { ok: true }],
  ]);
  const r = renderWithContext(<FacultyDashboard />, { ctx: { user: FAC, bookings } });
  return { ...r, f, ue: userEvent.setup() };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(ist(2026, 10, 21, 10));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('FacultyDashboard pending tab', () => {
  it('lists bookings, transfers and class-cancellation requests with count', async () => {
    setup();
    expect(await screen.findByRole('button', { name: 'Pending (3)' })).toBeInTheDocument();
    expect(screen.getByText('Extra DBMS')).toBeInTheDocument();
    expect(screen.getByText('Transfer slot to Bob from Ann')).toBeInTheDocument();
    expect(screen.getByText('Cancel class: AI')).toBeInTheDocument();
    expect(screen.getByText('Cancellation Request')).toBeInTheDocument();
    // 10:00 IST rendered in IST
    expect(screen.getByText('10:00 - 11:00')).toBeInTheDocument();
  });

  it('approve booking: checks own availability at the IST date/hour, then PATCHes approve and removes card', async () => {
    const { ue, f, ctx } = setup();
    await screen.findByText('Extra DBMS');
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await waitFor(() => expect(screen.queryByText('Extra DBMS')).toBeNull());
    const calls = fetchCalls(f);
    expect(calls).toContainEqual(['GET', '/api/timetable/faculty/check/21?date=2026-10-22&hour=10', undefined]);
    expect(calls).toContainEqual(['PATCH', '/api/faculty/1/approve', undefined]);
    expect(ctx.refreshAllData).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('done');
  });

  it('reject booking skips the availability check', async () => {
    const { ue, f } = setup();
    await screen.findByText('Extra DBMS');
    await ue.click(screen.getAllByRole('button', { name: /reject/i })[0]);
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/faculty/1/reject', undefined]));
    expect(fetchCalls(f).some(([, u]) => u.includes('/faculty/check/'))).toBe(false);
  });

  it('approve transfer maps to /transfers/:id/accept', async () => {
    const { ue, f } = setup();
    await screen.findByText(/Transfer slot to Bob/);
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[1]);
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/transfers/7/accept', undefined]));
  });

  it('approve class cancellation maps to /timetable/cancellation-requests/:id/approve', async () => {
    const { ue, f } = setup();
    await screen.findByText('Cancel class: AI');
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[2]);
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/timetable/cancellation-requests/3/approve', undefined]));
    await waitFor(() => expect(screen.queryByText('Cancel class: AI')).toBeNull());
  });

  it('busy faculty → conflict modal; Replace & Approve overrides the static slot then approves', async () => {
    const { ue, f } = setup({ routes: [['GET', /\/faculty\/check\//, { isOccupied: true, type: 'STATIC', content: 'OS lecture' }]] });
    await screen.findByText('Extra DBMS');
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    expect(await screen.findByText('Resolve Conflict')).toBeInTheDocument();
    expect(screen.getByText('OS lecture')).toBeInTheDocument();
    expect(fetchCalls(f).some(([, u]) => u === '/api/faculty/1/approve')).toBe(false);
    await ue.click(screen.getByRole('button', { name: /replace & approve/i }));
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/faculty/1/approve', undefined]));
    expect(fetchCalls(f)).toContainEqual(['POST', '/api/timetable/faculty/override', { date: '2026-10-22', hour: 10 }]);
  });

  it('dynamic conflict cancels the old booking first; Keep Existing closes without changes', async () => {
    const { ue, f } = setup({ routes: [['GET', /\/faculty\/check\//, { isOccupied: true, type: 'DYNAMIC', id: 444, content: 'Old booking' }]] });
    await screen.findByText('Extra DBMS');
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await ue.click(await screen.findByRole('button', { name: /keep existing/i }));
    expect(screen.queryByText('Resolve Conflict')).toBeNull();
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await ue.click(await screen.findByRole('button', { name: /replace & approve/i }));
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/faculty/1/approve', undefined]));
    expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/bookings/444/cancel', undefined]);
  });

  it('approve failure is toasted and the card stays', async () => {
    const { ue } = setup({ routes: [['PATCH', '/api/faculty/1/approve', () => jsonResponse({ error: 'Already handled' }, 400)]] });
    await screen.findByText('Extra DBMS');
    await ue.click(screen.getAllByRole('button', { name: 'Approve' })[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Already handled'));
    expect(screen.getByText('Extra DBMS')).toBeInTheDocument();
  });
});

describe('FacultyDashboard approved / my bookings', () => {
  const bk = (id, over) => ({ id, purpose: `P${id}`, room_name: `R-${id}`, start_time: iso(22, 9), end_time: iso(22, 10), status: 'ACTIVE', ...over });

  it('Approved tab: ACTIVE bookings where I am the faculty', async () => {
    const { ue } = setup({ bookings: [bk(1, { faculty_id: 500021 }), bk(2, { faculty_id: 21 }), bk(3, { faculty_id: 500021, status: 'CANCELLED' })] });
    await ue.click(screen.getByRole('button', { name: 'Approved' }));
    expect(screen.getByText('P1')).toBeInTheDocument();
    expect(screen.queryByText('P2')).toBeNull();
    expect(screen.queryByText('P3')).toBeNull();
  });

  it('My Bookings: cancel asks for confirmation then PATCHes cancel', async () => {
    const { ue, f } = setup({ bookings: [bk(9, { created_by: 21 })] });
    await ue.click(screen.getByRole('button', { name: 'My Bookings' }));
    await ue.click(screen.getByRole('button', { name: /cancel session/i }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/bookings/9/cancel', undefined]));
  });

  it('declining the confirm does not cancel', async () => {
    window.confirm.mockReturnValue(false);
    const { ue, f } = setup({ bookings: [bk(9, { created_by: 21 })] });
    await ue.click(screen.getByRole('button', { name: 'My Bookings' }));
    await ue.click(screen.getByRole('button', { name: /cancel session/i }));
    expect(fetchCalls(f).some(([, u]) => u.includes('/bookings/9/cancel'))).toBe(false);
  });

  // FE-19: "My Bookings" lists every booking I created (any status, any date) and offers Cancel Session on all.
  it('[FE-19] no "Cancel Session" on a CANCELLED booking', async () => {
    const { ue } = setup({ bookings: [bk(10, { created_by: 21, status: 'CANCELLED' })] });
    await ue.click(screen.getByRole('button', { name: 'My Bookings' }));
    expect(screen.queryByRole('button', { name: /cancel session/i })).toBeNull();
  });

  it('[FE-19] no "Cancel Session" on a booking that already ended', async () => {
    const { ue } = setup({ bookings: [bk(11, { created_by: 21, start_time: iso(20, 9), end_time: iso(20, 10) })] });
    await ue.click(screen.getByRole('button', { name: 'My Bookings' }));
    expect(screen.queryByRole('button', { name: /cancel session/i })).toBeNull();
  });
});

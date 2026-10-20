import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';
import { useWindowSize } from '../../hooks/useWindowSize';
import { useDepartments } from '../../hooks/useDepartments';
import { useAdminUsers } from '../../hooks/useAdminUsers';
import { useAdminData } from '../../hooks/useAdminData';
import { useAdminQuickBook } from '../../hooks/useAdminQuickBook';
import { useFacultyRequests } from '../../hooks/useFacultyRequests';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';
import { runInIST, ist } from '../utils/ist';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

// Hooks that compute "today" are tested with the worker in IST (container default is UTC).
runInIST();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useSearchDebounce', () => {
  it('debounces >=2 char strings and clears immediately below 2 chars', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useSearchDebounce(v, 300), { initialProps: { v: 'ab' } });
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(299); });
    expect(result.current).toBe('');
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('ab');
    rerender({ v: 'abc' });
    rerender({ v: 'abcd' });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe('abcd');
    rerender({ v: 'a' });
    expect(result.current).toBe('');
  });
});

describe('useWindowSize', () => {
  it('reports breakpoints and reacts to resize', () => {
    window.innerWidth = 500;
    const { result } = renderHook(() => useWindowSize());
    expect(result.current).toMatchObject({ width: 500, isMobile: true, isTablet: false, isDesktop: false });
    act(() => { window.innerWidth = 800; window.dispatchEvent(new Event('resize')); });
    expect(result.current).toMatchObject({ isMobile: false, isTablet: true });
    act(() => { window.innerWidth = 1024; window.dispatchEvent(new Event('resize')); });
    expect(result.current.isDesktop).toBe(true);
  });
});

describe('useDepartments', () => {
  it('loads array data and ignores non-array payloads', async () => {
    installFetch([['GET', /\/api\/departments/, [{ id: 1, name: 'IT' }]]]);
    const { result } = renderHook(() => useDepartments());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.departments).toEqual([{ id: 1, name: 'IT' }]);

    installFetch([['GET', /\/api\/departments/, { error: 'x' }]]);
    const r2 = renderHook(() => useDepartments());
    await waitFor(() => expect(r2.result.current.loading).toBe(false));
    expect(r2.result.current.departments).toEqual([]);
  });
});

describe('useAdminUsers', () => {
  it('fetches users only on users/quick tabs; deactivate DELETEs, toasts and refetches', async () => {
    const f = installFetch([
      ['GET', /\/api\/auth\/users\?/, { data: [{ id: 5 }], meta: { page: 1, totalPages: 2 } }],
      ['GET', /\/api\/departments/, []],
      ['DELETE', '/api/auth/users/5', { id: 5 }],
      ['DELETE', '/api/auth/users/6', () => jsonResponse({ error: 'You cannot deactivate yourself' }, 400)],
    ]);
    const { result, rerender } = renderHook(({ tab }) => useAdminUsers(tab), { initialProps: { tab: 'overview' } });
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(fetchCalls(f).some(([, u]) => u.includes('/auth/users'))).toBe(false);
    rerender({ tab: 'users' });
    await waitFor(() => expect(result.current.users).toEqual([{ id: 5 }]));
    expect(result.current.usersMeta).toEqual({ page: 1, totalPages: 2 });

    const listCalls = () => fetchCalls(f).filter(([m, u]) => m === 'GET' && u.includes('/auth/users')).length;
    const before = listCalls();
    await act(() => result.current.handleDeactivateUser(5));
    expect(toast.success).toHaveBeenCalledWith('User deactivated');
    await waitFor(() => expect(listCalls()).toBe(before + 1));

    await act(() => result.current.handleDeactivateUser(6));
    expect(toast.error).toHaveBeenCalledWith('You cannot deactivate yourself');
  });
});

describe('useAdminData', () => {
  it('requests the IST day/week range for the filter', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ist(2026, 10, 21, 10)); // Wed 10:00 IST
    const f = installFetch([
      ['GET', /\/api\/bookings\/admin\/all/, { data: [{ id: 1 }], meta: { page: 1, totalPages: 1 } }],
    ]);
    const { result, rerender } = renderHook(({ r }) => useAdminData(r), { initialProps: { r: 'day' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(f.mock.calls[0][0]).toBe('/api/bookings/admin/all?start_date=2026-10-20T18:30:00.000Z&end_date=2026-10-21T18:29:59.999Z&page=1&limit=20');
    expect(result.current.bookings).toEqual([{ id: 1 }]);
    expect(fetchCalls(f).some(([, u]) => u.includes('/promotions'))).toBe(false);
    rerender({ r: 'week' });
    await waitFor(() => expect(f.mock.calls.length).toBe(2));
    expect(f.mock.calls[1][0]).toContain('start_date=2026-10-18T18:30:00.000Z&end_date=2026-10-25T18:29:59.999Z');
  });

  it('toasts on failure', async () => {
    installFetch([['GET', /\/api\/bookings\/admin\/all/, () => jsonResponse({}, 500)]]);
    const { result } = renderHook(() => useAdminData('day'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(toast.error).toHaveBeenCalledWith('Failed to fetch data');
  });
});

describe('useAdminQuickBook', () => {
  it('fetches room statuses on the quick tab and submits room_name/date/slot payload', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ist(2026, 10, 20, 11));
    const f = installFetch([
      ['GET', /\/api\/rooms\/admin\/status/, [{ room_name: 'R-1', status: 'free' }]],
      ['POST', '/api/bookings/admin/quick', { id: 1 }],
    ]);
    const fetchData = vi.fn();
    const { result } = renderHook(() => useAdminQuickBook('quick', fetchData));
    await waitFor(() => expect(result.current.roomStatuses).toHaveLength(1));
    expect(f.mock.calls[0][0]).toBe('/api/rooms/admin/status?date=2026-10-20&slot=8');

    await act(() => result.current.handleQuickBookSubmit('R-1', null));
    expect(toast.error).toHaveBeenCalledWith('Please select a user first');

    act(() => result.current.updateQuickBookForm({ slot: '14', purpose: '' }));
    await act(() => result.current.handleQuickBookSubmit('R-1', 42));
    const post = fetchCalls(f).find(([m]) => m === 'POST');
    expect(post[2]).toEqual({ room_name: 'R-1', target_user_id: 42, date: '2026-10-20', slot: 14, purpose: 'Admin Override' });
    expect(fetchData).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Room R-1 booked successfully!');
  });

  it('does not fetch statuses on other tabs', () => {
    const f = installFetch([]);
    renderHook(() => useAdminQuickBook('users'));
    expect(f).not.toHaveBeenCalled();
  });

  // FE-14: default date is `new Date().toISOString()` (UTC) — between 00:00 and 05:30 IST it is yesterday.
  it('[FE-14] default quick-book date is the IST calendar day at 03:00 IST', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ist(2026, 10, 20, 3)); // 03:00 IST Tue == 21:30Z Mon
    installFetch([]);
    const { result } = renderHook(() => useAdminQuickBook('users'));
    expect(result.current.quickBookForm.date).toBe('2026-10-20');
  });
});

describe('useFacultyRequests', () => {
  it('skips loading for non-faculty roles', async () => {
    const f = installFetch([]);
    const { result } = renderHook(() => useFacultyRequests({ id: 1, role: 'VIEWER' }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(f).not.toHaveBeenCalled();
  });

  it('merges pending bookings, incoming transfers and class-cancellation requests', async () => {
    installFetch([
      ['GET', '/api/faculty/pending', [{ id: 1, purpose: 'Extra' }]],
      ['GET', '/api/transfers/incoming', [{ id: 7, requester_name: 'A', requestee_name: 'B', new_purpose: 'Quiz' }]],
      ['GET', '/api/timetable/cancellation-requests/pending', [{ id: 3, class_date: '2026-10-20T00:00:00.000Z', hour: 9, subject_name: 'DBMS' }]],
    ]);
    const user = { id: 21, role: 'FACULTY', permissions: ['cras.faculty_portal'] };
    const { result } = renderHook(() => useFacultyRequests(user));
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(3));
    const [b, t, c] = result.current.pendingRequests;
    expect(b).toEqual({ id: 1, purpose: 'Extra' });
    expect(t).toMatchObject({ id: 'transfer-7', originalTransferId: 7, isTransfer: true, purpose: 'Transfer slot to A from B (Quiz)', user_name: 'A' });
    expect(c).toMatchObject({ id: 'cancellation-3', cancellationRequestId: 3, isCancellationRequest: true, purpose: 'Cancel class: DBMS', start_time: '2026-10-20T09:00:00', end_time: '2026-10-20T10:00:00' });
  });

  it('toasts the server error when /faculty/pending fails but still tolerates sub-request failures', async () => {
    installFetch([
      ['GET', '/api/faculty/pending', () => jsonResponse({ error: 'nope' }, 500)],
      ['GET', '/api/transfers/incoming', () => { throw new TypeError('x'); }],
    ]);
    // transfers network error would be retried by apiFetch with real backoff; keep it fast with fake timers
    vi.useFakeTimers();
    const user = { id: 21, role: 'FACULTY', permissions: ['cras.faculty_portal'] };
    const { result } = renderHook(() => useFacultyRequests(user));
    await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
    expect(result.current.loading).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('nope');
  });
});

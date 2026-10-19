import React, { useContext } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider, AppContext } from '../../context/AppContext';
import Profile from '../../pages/Profile';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';
import { USERS } from '../utils/renderWithContext';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});

let ctx;
const Probe = () => { ctx = useContext(AppContext); return null; };
const mount = (children = <Probe />) => render(<MemoryRouter><AppProvider>{children}</AppProvider></MemoryRouter>);

const baseRoutes = () => [
  ['GET', '/api/health', { status: 'ok' }],
  ['GET', /\/api\/rooms\?/, [{ id: 1, name: 'R-1' }]],
  ['GET', '/api/auth/faculties', [{ id: 21, name: 'Prof Fay' }]],
  ['GET', '/api/departments', [{ id: 1, name: 'IT' }]],
  ['GET', /\/api\/bookings\/calendar\?/, { data: [{ id: 100 }], meta: {} }],
  ['GET', '/api/bookings/mine', { data: [] }],
  ['GET', '/api/availability', []],
  ['GET', '/api/transfers/incoming', [{ id: 1, status: 'PENDING' }, { id: 2, status: 'ACCEPTED' }, { id: 3, status: 'PENDING' }]],
  ['GET', '/api/transfers/outgoing', []],
  ['GET', /\/api\/timetable\?/, [{ day_of_week: 'Monday' }]],
  ['GET', '/api/timetable/faculty', { Mon: [] }],
  ['GET', '/api/timetable/faculty/overrides', [{ date: '2026-10-20', hour: 9 }]],
  ['POST', '/api/auth/logout', { ok: true }],
];

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  ctx = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Polling helper that does not rely on RTL's setInterval (faked in the health-check test).
const until = async (fn, ms = 3000) => {
  const t0 = Date.now();
  for (;;) {
    try { fn(); return; } catch (e) {
      if (Date.now() - t0 > ms) throw e;
      await act(() => new Promise((r) => setTimeout(r, 10)));
    }
  }
};

const urls = (f) => fetchCalls(f).map(([m, u]) => `${m} ${u}`);

describe('AppProvider initial user', () => {
  it.each([
    ['missing', null],
    ['literal "undefined"', 'undefined'],
    ['corrupt JSON', '{not json'],
  ])('%s localStorage user -> null user, only health is polled', async (_l, raw) => {
    if (raw !== null) localStorage.setItem('user', raw);
    const f = installFetch(baseRoutes());
    mount();
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(ctx.user).toBeNull();
    expect(urls(f)).toEqual(['GET /api/health']);
  });

  it('parses a stored user', () => {
    localStorage.setItem('user', JSON.stringify(USERS.VIEWER));
    installFetch(baseRoutes());
    mount();
    expect(ctx.user).toEqual(USERS.VIEWER);
  });
});

describe('AppProvider data loading per role', () => {
  it('student/viewer: rooms (5th Block default), faculties, departments, bookings, availability, transfers, student timetable', async () => {
    localStorage.setItem('user', JSON.stringify(USERS.VIEWER));
    const f = installFetch(baseRoutes());
    mount();
    await waitFor(() => expect(ctx.timetableData).toEqual([{ day_of_week: 'Monday' }]));
    await waitFor(() => expect(ctx.pendingTransferCount).toBe(2));
    const u = urls(f);
    expect(u).toEqual(expect.arrayContaining([
      'GET /api/rooms?building=5th+Block',
      'GET /api/auth/faculties',
      'GET /api/departments',
      'GET /api/bookings/mine',
      'GET /api/availability',
      'GET /api/transfers/incoming',
      'GET /api/transfers/outgoing',
      'GET /api/timetable?',
    ]));
    expect(u.some((x) => x.includes('/timetable/faculty'))).toBe(false);
    expect(ctx.rooms).toEqual([{ id: 1, name: 'R-1' }]);
    expect(ctx.bookings).toEqual([{ id: 100 }]);
    expect(u.some((x) => x.startsWith('GET /api/bookings?'))).toBe(false);
    expect(ctx.faculties).toEqual([{ id: 21, name: 'Prof Fay' }]);
  });

  it('faculty: loads faculty timetable + overrides instead of the student timetable', async () => {
    localStorage.setItem('user', JSON.stringify(USERS.FACULTY));
    const f = installFetch(baseRoutes());
    mount();
    await waitFor(() => expect(ctx.facultyOverrides).toHaveLength(1));
    expect(ctx.facultyTimetableData).toEqual({ Mon: [] });
    const u = urls(f);
    expect(u).toContain('GET /api/timetable/faculty');
    expect(u).toContain('GET /api/timetable/faculty/overrides');
    expect(u).not.toContain('GET /api/timetable?');
  });

  it('changing the building filter refetches rooms with Others expanded to Other+Others', async () => {
    localStorage.setItem('user', JSON.stringify(USERS.ADMIN));
    const f = installFetch(baseRoutes());
    mount();
    await waitFor(() => expect(ctx.rooms).toHaveLength(1));
    act(() => ctx.setFilters((p) => ({ ...p, building: ['4th Block', 'Others'] })));
    await waitFor(() => expect(urls(f)).toContain('GET /api/rooms?building=4th+Block&building=Other&building=Others'));
  });

  it('non-array rooms payload is ignored, failed fetches leave defaults', async () => {
    localStorage.setItem('user', JSON.stringify(USERS.VIEWER));
    const routes = baseRoutes().filter(([, m]) => !(m instanceof RegExp && String(m).includes('rooms')));
    routes.unshift(['GET', /\/api\/rooms\?/, { error: 'nope' }]);
    installFetch(routes);
    mount();
    await waitFor(() => expect(ctx.bookings).toHaveLength(1));
    expect(ctx.rooms).toEqual([]);
  });

  // FE-12 / PERF-01 regression: occupancy used to come from one `GET /bookings?limit=1000` (newest
  // created first), so older bookings silently dropped off the calendar. It now loads bounded IST
  // windows — this week and next, plus the selected day's week when browsing elsewhere — and merges
  // in the user's own bookings.
  it('[FE-12] loads this week and next, the selected week, and "mine", merged by id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T06:00:00Z')); // Wed 21 Oct 2026, IST
    localStorage.setItem('user', JSON.stringify(USERS.STUDENT_REP));
    const routes = baseRoutes().filter(([, m]) => !String(m).includes('bookings'));
    routes.unshift(
      ['GET', /\/api\/bookings\/calendar\?/, (url) => ({ data: url.includes('from=2026-10-19') ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }] })],
      ['GET', '/api/bookings/mine', { data: [{ id: 2, purpose: 'mine' }, { id: 9 }] }],
    );
    const f = installFetch(routes);
    mount();
    await waitFor(() => expect(ctx.bookings.map((b) => b.id).sort()).toEqual([1, 2, 9]));
    expect(ctx.bookings.find((b) => b.id === 2)).toEqual({ id: 2, purpose: 'mine' });
    expect(urls(f)).toContain('GET /api/bookings/calendar?from=2026-10-19&to=2026-11-01');

    act(() => ctx.setSelectedDay('2026-12-10'));
    await waitFor(() => expect(urls(f)).toContain('GET /api/bookings/calendar?from=2026-12-07&to=2026-12-13'));
    await waitFor(() => expect(ctx.bookings.map((b) => b.id).sort()).toEqual([1, 2, 3, 9]));
    vi.useRealTimers();
  });
});

describe('AppProvider health check', () => {
  it('shows connection error only after 2 consecutive failures, recovers and refreshes data', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    localStorage.setItem('user', JSON.stringify(USERS.VIEWER));
    let healthy = false;
    const routes = baseRoutes();
    routes[0] = ['GET', '/api/health', () => (healthy ? jsonResponse({ ok: 1 }) : jsonResponse({}, 500))];
    const f = installFetch(routes);
    mount();
    await until(() => expect(urls(f).filter((u) => u === 'GET /api/health')).toHaveLength(1));
    await act(async () => {});
    expect(ctx.backendError).toBeNull();

    await act(async () => { vi.advanceTimersByTime(30000); });
    await until(() => expect(ctx.backendError).toBe('Cannot connect to server. Please ensure the backend is running.'));

    healthy = true;
    const before = urls(f).filter((u) => u === 'GET /api/availability').length;
    await act(async () => { vi.advanceTimersByTime(30000); });
    await until(() => expect(ctx.backendError).toBeNull());
    await until(() => expect(urls(f).filter((u) => u === 'GET /api/availability').length).toBe(before + 1));
  });
});

describe('AppProvider logout / theme', () => {
  it('logout calls the API and clears storage + user even if the call fails', async () => {
    localStorage.setItem('user', JSON.stringify(USERS.VIEWER));
    localStorage.setItem('token', 't');
    const routes = baseRoutes().filter(([, m]) => m !== '/api/auth/logout');
    routes.push(['POST', '/api/auth/logout', () => jsonResponse({}, 500)]);
    const f = installFetch(routes);
    mount();
    await act(() => ctx.logout());
    expect(urls(f)).toContain('POST /api/auth/logout');
    expect(ctx.user).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('theme defaults to light, persists and toggles the dark class', () => {
    installFetch(baseRoutes());
    mount();
    expect(ctx.theme).toBe('light');
    act(() => ctx.setTheme('dark'));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('captures the PWA beforeinstallprompt event', () => {
    installFetch(baseRoutes());
    mount();
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    act(() => { window.dispatchEvent(ev); });
    expect(ev.defaultPrevented).toBe(true);
    expect(ctx.deferredPrompt).toBe(ev);
    act(() => ctx.clearInstallPrompt());
    expect(ctx.deferredPrompt).toBeNull();
  });
});

describe('Profile through the real provider (read-only)', () => {
  it('shows the ACL profile refreshed from /auth/me and never writes it back', async () => {
    localStorage.setItem('user', JSON.stringify(USERS.STUDENT_REP));
    localStorage.setItem('token', 't');
    const routes = baseRoutes();
    routes.push(['GET', '/api/auth/me', { user: { ...USERS.STUDENT_REP, semester: 6, section: 3, department_name: 'Information Technology' } }]);
    const f = installFetch(routes);
    mount(<><Probe /><Profile /></>);
    expect(await screen.findByText(/Semester 6\s*· Section 3/)).toBeInTheDocument();
    expect(screen.getByText('Information Technology')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit profile/i })).toBeNull();
    expect(fetchCalls(f).some(([m]) => m === 'PATCH')).toBe(false);
  });
});

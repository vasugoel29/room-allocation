import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import App from '../../App';
import { renderWithContext, USERS } from '../utils/renderWithContext';

// Pages are replaced with stubs: these tests cover routing / guards only.
const { stub } = vi.hoisted(() => ({
  stub: (name) => ({ default: () => React.createElement('div', { 'data-testid': 'page' }, name) }),
}));
vi.mock('../../pages/AdminDashboard', () => stub('AdminDashboard'));
vi.mock('../../pages/AdminTimetable', () => stub('AdminTimetable'));
vi.mock('../../pages/FacultyDashboard', () => stub('FacultyDashboard'));
vi.mock('../../pages/Timetable', () => stub('Timetable'));
vi.mock('../../pages/Bookings', () => stub('Bookings'));
vi.mock('../../pages/Login', () => stub('Login'));
vi.mock('../../pages/Profile', () => stub('Profile'));
vi.mock('../../pages/MobileHistory', () => stub('MobileHistory'));
vi.mock('../../pages/MobileBooking', () => stub('MobileBooking'));
vi.mock('../../components/ui/Calendar', () => stub('Calendar'));

const go = (route, user, ctx = {}) => renderWithContext(<App />, { route, ctx: { user, ...ctx } });
const page = async () => (await screen.findByTestId('page')).textContent;

beforeEach(() => { window.innerWidth = 1280; localStorage.clear(); });

describe('App routing — unauthenticated', () => {
  // Removed local-account pages (/forgot-password, /reset-password, /promotion, /signup) are unknown routes now.
  it.each([['/'], ['/calendar'], ['/admin'], ['/bookings'], ['/nonsense'], ['/forgot-password'], ['/reset-password?token=x'], ['/promotion'], ['/signup']])('%s -> Login', async (route) => {
    go(route, null);
    expect(await page()).toBe('Login');
  });
});

describe('App routing — role landing and guards', () => {
  it.each([
    ['ADMIN', 'AdminDashboard'],
    ['FACULTY', 'FacultyDashboard'],
    ['STUDENT_REP', 'Calendar'],
    ['VIEWER', 'Calendar'],
  ])('%s: / and /login land on %s', async (role, name) => {
    go('/login', USERS[role]);
    expect(await page()).toBe(name);
  });

  it.each([
    ['/admin', 'VIEWER', 'Calendar'],
    ['/admin', 'FACULTY', 'Calendar'],
    ['/admin', 'STUDENT_REP', 'Calendar'],
    ['/admin', 'ADMIN', 'AdminDashboard'],
    ['/faculty', 'STUDENT_REP', 'Calendar'],
    ['/faculty', 'ADMIN', 'FacultyDashboard'],
    ['/faculty', 'FACULTY', 'FacultyDashboard'],
    ['/bookings', 'VIEWER', 'Calendar'],
    ['/bookings', 'STUDENT_REP', 'Bookings'],
    ['/bookings', 'FACULTY', 'Bookings'],
    ['/bookings', 'ADMIN', 'Bookings'],
    ['/timetable', 'VIEWER', 'Timetable'],
    ['/profile', 'FACULTY', 'Profile'],
    ['/promotion', 'VIEWER', 'Calendar'],
    ['/forgot-password', 'STUDENT_REP', 'Calendar'],
    ['/reset-password?token=x', 'FACULTY', 'Calendar'],
    ['/admin/timetable', 'ADMIN', 'AdminDashboard'],
    ['/does-not-exist', 'VIEWER', 'Calendar'],
  ])('%s as %s -> %s', async (route, role, name) => {
    go(route, USERS[role]);
    expect(await page()).toBe(name);
  });

  it('/history on desktop redirects to Bookings, on mobile shows MobileHistory', async () => {
    go('/history', USERS.STUDENT_REP);
    expect(await page()).toBe('Bookings');
  });
  it('/history on mobile', async () => {
    window.innerWidth = 400;
    go('/history', USERS.STUDENT_REP);
    expect(await page()).toBe('MobileHistory');
  });
  it('/book-a-slot on desktop redirects to the calendar', async () => {
    go('/book-a-slot', USERS.STUDENT_REP);
    expect(await page()).toBe('Calendar');
  });

  // FE-24: /book-a-slot and /history are not role-gated — a VIEWER on a phone reaches the booking flow.
  it.fails('[FE-24] VIEWER on mobile cannot open /book-a-slot', async () => {
    window.innerWidth = 400;
    go('/book-a-slot', USERS.VIEWER);
    expect(await page()).toBe('Calendar');
  });
});

describe('App shell', () => {
  it('backend error replaces the app with the Connection Error screen', () => {
    go('/calendar', USERS.VIEWER, { backendError: 'Cannot connect to server.' });
    expect(screen.getByText('Connection Error')).toBeInTheDocument();
    expect(screen.getByText('Cannot connect to server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry connection/i })).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', ['Admin Console', 'Rooms', 'Bookings', 'Timetable', 'Profile']],
    ['FACULTY', ['Faculty Portal', 'Rooms', 'Timetable', 'Profile']],
    ['VIEWER', ['Rooms', 'Timetable', 'Profile']],
    ['STUDENT_REP', ['Rooms', 'Bookings', 'Timetable', 'Profile']],
  ])('%s sidebar navigation', async (role, labels) => {
    go('/profile', USERS[role]);
    await page();
    const aside = document.querySelector('aside');
    expect(within(aside).getAllByRole('link').map((a) => a.textContent)).toEqual(labels);
    expect(within(aside).getByText(USERS[role].name)).toBeInTheDocument();
  });

  it('room filter + day/week toggle only on /calendar', async () => {
    const { ctx, unmount } = go('/calendar', USERS.VIEWER);
    await page();
    expect(screen.getByPlaceholderText('Search room name...')).toBeInTheDocument();
    screen.getByRole('button', { name: /week/i }).click();
    expect(ctx.setViewMode).toHaveBeenCalledWith('week');
    unmount();
    go('/profile', USERS.VIEWER);
    await page();
    expect(screen.queryByPlaceholderText('Search room name...')).toBeNull();
  });

  it('logout button calls context logout', async () => {
    const { ctx } = go('/profile', USERS.VIEWER);
    await page();
    screen.getByTitle('Logout').click();
    expect(ctx.logout).toHaveBeenCalled();
  });
});

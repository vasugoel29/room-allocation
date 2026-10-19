import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../../pages/Login';
import ForgotPassword from '../../pages/ForgotPassword';
import ResetPassword from '../../pages/ResetPassword';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

afterEach(() => { vi.unstubAllEnvs(); delete window.google; });

/** Minimal Google Identity Services stub; returns a trigger for the sign-in callback. */
function installGoogle() {
  const gis = { initialize: vi.fn(), renderButton: vi.fn(), prompt: vi.fn() };
  window.google = { accounts: { id: gis } };
  return { gis, signIn: (credential) => gis.initialize.mock.calls.at(-1)[0].callback({ credential }) };
}

describe('Login', () => {
  it('renders the official Google button when a client id is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid.apps.googleusercontent.com');
    const { gis } = installGoogle();
    renderWithContext(<Login />, { ctx: { user: null } });
    await waitFor(() => expect(gis.renderButton).toHaveBeenCalled());
    expect(gis.initialize.mock.calls[0][0].client_id).toBe('cid.apps.googleusercontent.com');
  });

  it('[ACL-01] posts only the Google credential, stores the session and sets the user', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid');
    const f = installFetch([['POST', '/api/auth/google', { token: 'tk', user: USERS.VIEWER }]]);
    const { signIn } = installGoogle();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await waitFor(() => expect(window.google.accounts.id.initialize).toHaveBeenCalled());
    await act(async () => { signIn('google-id-token'); });
    await waitFor(() => expect(ctx.setUser).toHaveBeenCalledWith(USERS.VIEWER));
    expect(fetchCalls(f)[0]).toEqual(['POST', '/api/auth/google', { credential: 'google-id-token' }]);
    expect(localStorage.getItem('token')).toBe('tk');
  });

  it('shows the server error and stores nothing when sign-in is refused', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'cid');
    installFetch([['POST', '/api/auth/google', () => jsonResponse({ error: 'You are not registered in the institutional access directory.' }, 403)]]);
    const { signIn } = installGoogle();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await waitFor(() => expect(window.google.accounts.id.initialize).toHaveBeenCalled());
    await act(async () => { signIn('t'); });
    expect(await screen.findByRole('alert')).toHaveTextContent('not registered');
    expect(ctx.setUser).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('[ACL-01] without a Google client id, the button explains the problem and calls no API (no hardcoded fallback)', async () => {
    const f = installFetch([]);
    const user = userEvent.setup();
    renderWithContext(<Login />, { ctx: { user: null } });
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/not configured/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('hides developer sign-in unless VITE_DEV_LOGIN=true', () => {
    renderWithContext(<Login />, { ctx: { user: null } });
    expect(screen.queryByLabelText(/developer sign-in/i)).toBeNull();
  });

  it('developer sign-in posts the email and stores the session', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    const f = installFetch([['POST', '/api/auth/dev-login', { token: 'dev', user: USERS.STUDENT_REP }]]);
    const user = userEvent.setup();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await user.type(screen.getByLabelText(/developer sign-in \(local only\)/i), 'rep@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /dev sign in/i }));
    await waitFor(() => expect(ctx.setUser).toHaveBeenCalledWith(USERS.STUDENT_REP));
    expect(fetchCalls(f)[0]).toEqual(['POST', '/api/auth/dev-login', { email: 'rep@nsut.ac.in' }]);
    expect(localStorage.getItem('token')).toBe('dev');
  });

  // FE-04: the (now 12-hour) session token is still kept in localStorage, readable by any XSS.
  it.fails('[FE-04] does not persist the session token in localStorage', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    installFetch([['POST', '/api/auth/dev-login', { token: 'tk', user: USERS.VIEWER }]]);
    const user = userEvent.setup();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await user.type(screen.getByLabelText(/developer sign-in \(local only\)/i), 'viewer@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /dev sign in/i }));
    await waitFor(() => expect(ctx.setUser).toHaveBeenCalled());
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('ForgotPassword', () => {
  const emailInput = () => screen.getByPlaceholderText('rollno@nsut.ac.in');

  it('requires an NSUT email', async () => {
    const f = installFetch([]);
    const user = userEvent.setup();
    renderWithContext(<ForgotPassword />);
    await user.type(emailInput(), 'x@yahoo.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only NSUT emails');
    expect(f).not.toHaveBeenCalled();
  });

  it('posts the email and shows the neutral confirmation', async () => {
    const f = installFetch([['POST', '/api/auth/forgot-password', { message: 'ok' }]]);
    const user = userEvent.setup();
    renderWithContext(<ForgotPassword />);
    await user.type(emailInput(), 'a@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByText(/we've sent a password reset link/i)).toBeInTheDocument();
    expect(screen.getByText('a@nsut.ac.in')).toBeInTheDocument();
    expect(fetchCalls(f)[0]).toEqual(['POST', '/api/auth/forgot-password', { email: 'a@nsut.ac.in' }]);
    expect(screen.queryByRole('button', { name: /send reset link/i })).toBeNull();
  });

  it('shows server errors', async () => {
    installFetch([['POST', '/api/auth/forgot-password', () => jsonResponse({ error: 'Too many requests' }, 429)]]);
    const user = userEvent.setup();
    renderWithContext(<ForgotPassword />);
    await user.type(emailInput(), 'a@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  });
});

describe('ResetPassword', () => {
  const pw = () => screen.getAllByPlaceholderText('••••••••');

  it('without ?token shows the invalid-link screen', () => {
    renderWithContext(<ResetPassword />, { route: '/reset-password' });
    expect(screen.getByText('Invalid Reset Link')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request new link/i })).toHaveAttribute('href', '/forgot-password');
  });

  it('enforces min length 6 before mismatch, without calling the API', async () => {
    const f = installFetch([]);
    const user = userEvent.setup();
    const { container } = renderWithContext(<ResetPassword />, { route: '/reset-password?token=abc' });
    container.querySelector('form').noValidate = true; // bypass native minLength to reach JS validation
    await user.type(pw()[0], '12345');
    await user.type(pw()[1], '99999');
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 6 characters');
    expect(f).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    const f = installFetch([]);
    const user = userEvent.setup();
    renderWithContext(<ResetPassword />, { route: '/reset-password?token=abc' });
    await user.type(pw()[0], 'secret12');
    await user.type(pw()[1], 'secret13');
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(f).not.toHaveBeenCalled();
  });

  it('posts token + password and shows success', async () => {
    const f = installFetch([['POST', '/api/auth/reset-password', { message: 'ok' }]]);
    const user = userEvent.setup();
    renderWithContext(<ResetPassword />, { route: '/reset-password?token=t%2Bk' });
    await user.type(pw()[0], 'secret12');
    await user.type(pw()[1], 'secret12');
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByText(/your password has been reset/i)).toBeInTheDocument();
    expect(fetchCalls(f)[0]).toEqual(['POST', '/api/auth/reset-password', { token: 't+k', password: 'secret12' }]);
  });

  it('shows expired-token error from server', async () => {
    installFetch([['POST', '/api/auth/reset-password', () => jsonResponse({ error: 'Invalid or expired token' }, 400)]]);
    const user = userEvent.setup();
    renderWithContext(<ResetPassword />, { route: '/reset-password?token=old' });
    await user.type(pw()[0], 'secret12');
    await user.type(pw()[1], 'secret12');
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired token');
  });
});

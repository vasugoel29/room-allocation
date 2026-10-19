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

const fillLogin = async (user, email, pw = 'secret123') => {
  await user.type(screen.getByLabelText(/email address/i), email);
  await user.type(screen.getByLabelText(/^password/i), pw);
};

describe('Login', () => {
  it('rejects non-NSUT emails client-side without calling the API', async () => {
    const f = installFetch([]);
    const user = userEvent.setup();
    renderWithContext(<Login />, { ctx: { user: null } });
    await fillLogin(user, 'someone@gmail.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Only NSUT emails (@nsut.ac.in) are accepted');
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-invalid', 'true');
    expect(f).not.toHaveBeenCalled();
  });

  it('accepts mixed-case @NSUT.AC.IN', async () => {
    const f = installFetch([['POST', '/api/auth/login', { token: 'tk', user: USERS.VIEWER }]]);
    const user = userEvent.setup();
    renderWithContext(<Login />, { ctx: { user: null } });
    await fillLogin(user, 'Roll@NSUT.AC.IN');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
  });

  it('on success posts credentials, stores session and sets the user', async () => {
    const f = installFetch([['POST', '/api/auth/login', { token: 'tk', user: USERS.VIEWER }]]);
    const user = userEvent.setup();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await fillLogin(user, 'viewer@nsut.ac.in', 'pw123456');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(ctx.setUser).toHaveBeenCalledWith(USERS.VIEWER));
    expect(fetchCalls(f)[0]).toEqual(['POST', '/api/auth/login', { email: 'viewer@nsut.ac.in', password: 'pw123456' }]);
    expect(JSON.parse(localStorage.getItem('user'))).toEqual(USERS.VIEWER);
    expect(localStorage.getItem('token')).toBe('tk');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the server error and does not store anything on 401', async () => {
    installFetch([['POST', '/api/auth/login', () => jsonResponse({ error: 'Invalid email or password' }, 401)]]);
    const user = userEvent.setup();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await fillLogin(user, 'viewer@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(ctx.setUser).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('shows "Server is waking up..." after 4s and disables the button while pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolve;
    installFetch([['POST', '/api/auth/login', () => new Promise((r) => { resolve = r; })]]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderWithContext(<Login />, { ctx: { user: null } });
    await fillLogin(user, 'viewer@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /authenticat|sign in/i }));
    const btn = screen.getByRole('button', { name: /authenticating/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('Contacting server...');
    await act(async () => { vi.advanceTimersByTime(4000); });
    expect(btn).toHaveTextContent('Server is waking up...');
    await act(async () => { resolve(jsonResponse({ token: 't', user: USERS.VIEWER })); });
    await waitFor(() => expect(localStorage.getItem('token')).toBe('t'));
  });

  it('links to forgot password', () => {
    renderWithContext(<Login />, { ctx: { user: null } });
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
  });

  // FE-04 / SEC-09: a 30-day bearer JWT is written to localStorage (readable by any XSS).
  it.fails('[FE-04] does not persist the JWT in localStorage', async () => {
    installFetch([['POST', '/api/auth/login', { token: 'tk', user: USERS.VIEWER }]]);
    const user = userEvent.setup();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await fillLogin(user, 'viewer@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
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

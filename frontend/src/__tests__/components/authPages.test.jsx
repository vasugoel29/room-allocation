import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../../pages/Login';
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
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    const f = installFetch([]);
    const user = userEvent.setup();
    renderWithContext(<Login />, { ctx: { user: null } });
    await user.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/not configured/i);
    expect(f).not.toHaveBeenCalled();
  });

  it('hides developer sign-in unless VITE_DEV_LOGIN=true', () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'false');
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

  // FE-04 — closed by decision (2026-10-20): frontend (Vercel) and API are on different domains, so the
  // 12-hour bearer token stays in localStorage; the mitigation is the strict CSP in vercel.json
  // (no inline or third-party scripts beyond Google sign-in) plus server-side revocation.
  it('[FE-04] keeps the 12-hour bearer token for the API (different domains; protected by CSP)', async () => {
    vi.stubEnv('VITE_DEV_LOGIN', 'true');
    installFetch([['POST', '/api/auth/dev-login', { token: 'tk', user: USERS.VIEWER }]]);
    const user = userEvent.setup();
    const { ctx } = renderWithContext(<Login />, { ctx: { user: null } });
    await user.type(screen.getByLabelText(/developer sign-in \(local only\)/i), 'viewer@nsut.ac.in');
    await user.click(screen.getByRole('button', { name: /dev sign in/i }));
    await waitFor(() => expect(ctx.setUser).toHaveBeenCalled());
    expect(localStorage.getItem('token')).toBe('tk');
  });
});

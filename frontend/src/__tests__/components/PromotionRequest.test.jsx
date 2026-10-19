import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromotionRequest from '../../pages/PromotionRequest';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => vi.unstubAllGlobals());

const setup = (me, user = USERS.VIEWER, extra = []) => {
  const f = installFetch([...extra, ['GET', '/api/promotions/me', me], ['POST', '/api/promotions', { id: 1 }]]);
  renderWithContext(<PromotionRequest />, { ctx: { user } });
  return { f, ue: userEvent.setup() };
};

describe('PromotionRequest', () => {
  it('shows a skeleton until the status loads', async () => {
    let release;
    installFetch([['GET', '/api/promotions/me', () => new Promise((r) => { release = r; })]]);
    renderWithContext(<PromotionRequest />, { ctx: { user: USERS.VIEWER } });
    expect(screen.queryByText('Representative Request')).toBeNull();
    release(jsonResponse(null));
    expect(await screen.findByText('Representative Request')).toBeInTheDocument();
  });

  it('student reps see the "already a rep" state', async () => {
    setup(null, USERS.STUDENT_REP);
    expect(await screen.findByText('You are a Rep!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit request/i })).toBeNull();
  });

  it('no request yet: empty reason is rejected client-side', async () => {
    const { ue, f } = setup(null);
    expect(await screen.findByText('No Active Request')).toBeInTheDocument();
    await ue.type(screen.getByPlaceholderText(/official CR/i), '   ');
    await ue.click(screen.getByRole('button', { name: /submit request/i }));
    expect(toast.error).toHaveBeenCalledWith('Please provide a reason for your request');
    expect(fetchCalls(f).some(([m]) => m === 'POST')).toBe(false);
  });

  it('submits the reason, toasts and refetches status', async () => {
    const { ue, f } = setup(null);
    await screen.findByText('No Active Request');
    await ue.type(screen.getByPlaceholderText(/official CR/i), 'I am CR of IT-2');
    await ue.click(screen.getByRole('button', { name: /submit request/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request submitted successfully!'));
    expect(fetchCalls(f).find(([m]) => m === 'POST')).toEqual(['POST', '/api/promotions', { reason: 'I am CR of IT-2' }]);
    await waitFor(() => expect(fetchCalls(f).filter(([, u]) => u === '/api/promotions/me')).toHaveLength(2));
    expect(screen.getByPlaceholderText(/official CR/i)).toHaveValue('');
  });

  it('server error on submit is toasted', async () => {
    const { ue } = setup(null, USERS.VIEWER, [['POST', '/api/promotions', () => jsonResponse({ error: 'Already pending' }, 400)]]);
    await screen.findByText('No Active Request');
    await ue.type(screen.getByPlaceholderText(/official CR/i), 'x');
    await ue.click(screen.getByRole('button', { name: /submit request/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Already pending'));
  });

  it('PENDING request disables the form', async () => {
    setup({ status: 'PENDING', reason: 'pls', created_at: '2026-10-01T10:00:00Z' });
    expect(await screen.findByText('Pending Review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request pending/i })).toBeDisabled();
    expect(screen.getByPlaceholderText(/official CR/i)).toBeDisabled();
    expect(screen.getByText('"pls"')).toBeInTheDocument();
  });

  it.each([
    ['APPROVED', 'Approved'],
    ['REJECTED', 'Rejected'],
  ])('%s request shows status and admin comment; form re-enabled', async (status, label) => {
    setup({ status, reason: 'r', admin_comment: 'see me', created_at: '2026-10-01T10:00:00Z' });
    expect(await screen.findByText(label)).toBeInTheDocument();
    expect(screen.getByText('see me')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit request/i })).toBeEnabled();
  });

  it('status fetch failure falls back to the empty state', async () => {
    setup(() => jsonResponse({}, 500));
    expect(await screen.findByText('No Active Request')).toBeInTheDocument();
  });
});

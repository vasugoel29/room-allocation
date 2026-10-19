import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberPicker from '../../features/admin/MemberPicker';
import { installFetch } from '../utils/http';

afterEach(() => vi.unstubAllGlobals());

const loaded = [{ id: 1, name: 'Admin One', email: 'a1@nsut.ac.in' }];

describe('MemberPicker (Quick Book recipient)', () => {
  it('shows the preloaded users until the admin types', () => {
    installFetch([]);
    render(<MemberPicker initialUsers={loaded} onPick={() => {}} />);
    expect(screen.getByRole('button', { name: /Admin One/ })).toBeInTheDocument();
  });

  it('[FE-15] searches the server, so a user outside the first page can be picked', async () => {
    const f = installFetch([
      ['GET', /\/api\/auth\/users\?/, (url) => ({
        data: url.includes('search=rep.far') ? [{ id: 77, name: 'Far Away Rep', email: 'rep.far@nsut.ac.in' }] : [],
        meta: { page: 1, totalPages: 1 },
      })],
    ]);
    const onPick = vi.fn();
    const ue = userEvent.setup();
    render(<MemberPicker initialUsers={loaded} onPick={onPick} />);
    await ue.type(screen.getByPlaceholderText('Search members...'), 'rep.far');
    const option = await screen.findByRole('button', { name: /Far Away Rep/ });
    expect(f.mock.calls.some(([u]) => u.includes('/api/auth/users?page=1&limit=20&search=rep.far'))).toBe(true);
    await ue.click(option);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 77 }));
  });

  it('a failed search is reported, not shown as "No users found"', async () => {
    installFetch([['GET', /\/api\/auth\/users\?/, () => new Response('{}', { status: 500 })]]);
    const ue = userEvent.setup();
    render(<MemberPicker initialUsers={loaded} onPick={() => {}} />);
    await ue.type(screen.getByPlaceholderText('Search members...'), 'x');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/search failed/i));
    expect(screen.queryByText(/no users found/i)).toBeNull();
  });
});

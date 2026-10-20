import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import NotificationBell from '../../components/ui/NotificationBell';
import { installFetch, fetchCalls } from '../utils/http';

afterEach(() => vi.unstubAllGlobals());

const n = (id, extra = {}) => ({
  id, type: 'booking_approved', title: `Title ${id}`, body: `Body ${id}`, link: '/bookings',
  read_at: null, created_at: new Date().toISOString(), ...extra,
});

function setup(routes) {
  const f = installFetch(routes);
  const ue = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/calendar']}>
      <Routes>
        <Route path="*" element={<><NotificationBell /><div data-testid="page" /></>} />
        <Route path="/bookings" element={<><NotificationBell /><p>Bookings page</p></>} />
      </Routes>
    </MemoryRouter>,
  );
  return { f, ue };
}

const base = (items = [n(2), n(1, { read_at: '2026-10-20T00:00:00Z' })]) => [
  ['GET', '/api/notifications/unread-count', { unread: items.filter((x) => !x.read_at).length }],
  ['GET', /\/api\/notifications\?/, { data: items, unread: items.filter((x) => !x.read_at).length }],
  ['PATCH', /\/api\/notifications\/\d+\/read$/, (url) => n(Number(url.split('/')[3]), { read_at: new Date().toISOString() })],
  ['POST', '/api/notifications/read-all', { updated: 1 }],
  ['DELETE', /\/api\/notifications\/\d+$/, { message: 'Notification dismissed' }],
];

describe('NotificationBell', () => {
  it('shows the unread count from the server', async () => {
    setup(base());
    expect(await screen.findByRole('button', { name: 'Notifications, 1 unread' })).toBeInTheDocument();
  });

  it('opens the inbox, and clicking an item marks it read and goes to its page', async () => {
    const { ue, f } = setup(base());
    await ue.click(await screen.findByRole('button', { name: /notifications, 1 unread/i }));
    const panel = await screen.findByRole('dialog', { name: 'Notifications' });
    await ue.click((await within(panel).findByText('Title 2')).closest('button'));
    expect(fetchCalls(f)).toContainEqual(['PATCH', '/api/notifications/2/read', undefined]);
    expect(await screen.findByText('Bookings page')).toBeInTheDocument();
  });

  it('dismiss removes the item; mark all read clears the count', async () => {
    const { ue, f } = setup(base([n(3), n(2)]));
    await ue.click(await screen.findByRole('button', { name: /notifications, 2 unread/i }));
    const panel = await screen.findByRole('dialog');
    await ue.click(await within(panel).findByRole('button', { name: 'Dismiss: Title 3' }));
    expect(within(panel).queryByText('Title 3')).toBeNull();
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['DELETE', '/api/notifications/3', undefined]));
    await ue.click(within(panel).getByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument());
  });

  it('Escape closes the panel; an empty inbox says so; a failed load is shown', async () => {
    const { ue } = setup(base([]));
    await ue.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument();
    await ue.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    vi.unstubAllGlobals();
    installFetch([['GET', '/api/notifications/unread-count', { unread: 0 }], ['GET', /\/api\/notifications\?/, () => new Response('{}', { status: 500 })]]);
    await ue.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load notifications/i);
  });
});

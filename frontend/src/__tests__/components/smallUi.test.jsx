import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Calendar as CalIcon, History, Clock, User, Shield, GraduationCap } from 'lucide-react';
import ConfirmModal from '../../components/modals/ConfirmModal';
import RoomFilter from '../../components/ui/RoomFilter';
import BottomNav from '../../components/ui/BottomNav';
import { renderWithContext, USERS } from '../utils/renderWithContext';

describe('ConfirmModal', () => {
  const setup = (props = {}) => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmModal isOpen onClose={onClose} onConfirm={onConfirm} title="Cancel Booking" message="Are you sure?" confirmText="Yes, cancel" {...props} />);
    return { onClose, onConfirm, ue: userEvent.setup() };
  };

  it('renders nothing when closed', () => {
    const { container } = render(<ConfirmModal isOpen={false} onClose={() => {}} onConfirm={() => {}} title="t" message="m" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is a labelled modal dialog with title and message', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Cancel Booking' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('confirm runs onConfirm then closes', async () => {
    const { ue, onClose, onConfirm } = setup();
    await ue.click(screen.getByRole('button', { name: 'Yes, cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel, X and Escape only close', async () => {
    const { ue, onClose, onConfirm } = setup();
    await ue.click(screen.getByRole('button', { name: 'Cancel' }));
    await ue.click(screen.getByRole('button', { name: 'Close modal' }));
    await ue.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('focuses a non-destructive control first and traps Tab inside', async () => {
    const { ue } = setup();
    expect(document.activeElement).toHaveAccessibleName('Close modal');
    screen.getByRole('button', { name: 'Yes, cancel' }).focus();
    await ue.tab();
    expect(document.activeElement).toHaveAccessibleName('Close modal');
    await ue.tab({ shift: true });
    expect(document.activeElement).toHaveTextContent('Yes, cancel');
  });

  it('defaults confirm label to "Confirm"', () => {
    render(<ConfirmModal isOpen onClose={() => {}} onConfirm={() => {}} title="t" message="m" />);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });
});

describe('RoomFilter', () => {
  const base = { smartRoom: false, searchTerm: '', floor: 'all', building: ['5th Block'], roomType: 'all' };
  const setup = (user = USERS.STUDENT_REP, filters = base) => renderWithContext(<RoomFilter />, { ctx: { user, filters } });
  const applied = (ctx, prev = base) => ctx.setFilters.mock.calls.at(-1)[0](prev);

  it('search term updates filters.searchTerm', () => {
    const { ctx } = setup();
    fireEvent.change(screen.getByPlaceholderText('Search room name...'), { target: { value: '61' } });
    expect(applied(ctx)).toEqual({ ...base, searchTerm: '61' });
  });

  it('building toggles add/remove and fall back to all', () => {
    const { ctx } = setup();
    fireEvent.click(screen.getByRole('button', { name: '4th' }));
    expect(applied(ctx).building).toEqual(['5th Block', '4th Block']);
    fireEvent.click(screen.getByRole('button', { name: '5th' }));
    expect(applied(ctx).building).toEqual(['all']); // removing the only selection
    fireEvent.click(screen.getAllByRole('button', { name: 'All' })[0]); // block 'All' (floor also has one)
    expect(applied(ctx).building).toEqual(['all']);
  });

  it('selecting a block while "all" is active replaces it', () => {
    const { ctx } = setup(USERS.STUDENT_REP, { ...base, building: ['all'] });
    fireEvent.click(screen.getByRole('button', { name: 'APJ' }));
    expect(applied(ctx, { ...base, building: ['all'] }).building).toEqual(['APJ Block']);
  });

  it('floor, room type and smart toggle', () => {
    const { ctx } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'G' }));
    expect(applied(ctx).floor).toBe('G');
    fireEvent.click(screen.getByRole('button', { name: 'Labs' }));
    expect(applied(ctx).roomType).toBe('Lab');
    fireEvent.click(screen.getByRole('button', { name: /ac & projector only/i }));
    expect(applied(ctx).smartRoom).toBe(true);
  });

  it('students do not get Others block, Auditoriums or Committee Rooms', () => {
    setup(USERS.VIEWER);
    expect(screen.queryByRole('button', { name: 'Others' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auditoriums' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Committee Rooms' })).toBeNull();
  });

  it.each([['FACULTY'], ['ADMIN']])('%s sees Others, Auditoriums and Committee Rooms', (role) => {
    setup(USERS[role]);
    expect(screen.getByRole('button', { name: 'Others' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Auditoriums' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Committee Rooms' })).toBeInTheDocument();
  });
});

describe('BottomNav per role (tabs as built by App.jsx)', () => {
  const TABS = {
    ADMIN: [{ id: 'admin', icon: Shield, label: 'Admin Console' }, { id: 'calendar', icon: CalIcon, label: 'Rooms' }, { id: 'admin/timetable', icon: Clock, label: 'Timetable' }, { id: 'profile', icon: User, label: 'Profile' }],
    FACULTY: [{ id: 'faculty', icon: GraduationCap, label: 'Faculty Portal' }, { id: 'calendar', icon: CalIcon, label: 'Rooms' }, { id: 'timetable', icon: Clock, label: 'Timetable' }, { id: 'profile', icon: User, label: 'Profile' }],
    VIEWER: [{ id: 'calendar', icon: CalIcon, label: 'Rooms' }, { id: 'timetable', icon: Clock, label: 'Timetable' }, { id: 'profile', icon: User, label: 'Profile' }],
    STUDENT_REP: [{ id: 'calendar', icon: CalIcon, label: 'Rooms' }, { id: 'bookings', icon: History, label: 'Bookings' }, { id: 'timetable', icon: Clock, label: 'Timetable' }, { id: 'profile', icon: User, label: 'Profile' }],
  };
  const Loc = () => <div data-testid="loc">{useLocation().pathname}</div>;
  const setup = (role, extra = {}) => render(
    <MemoryRouter initialEntries={['/calendar']}>
      <BottomNav user={USERS[role]} tabs={TABS[role]} {...extra} />
      <Routes><Route path="*" element={<Loc />} /></Routes>
    </MemoryRouter>,
  );
  const hrefs = () => screen.getAllByRole('link').map((a) => a.getAttribute('href'));

  it('VIEWER: 3 links, no create button', () => {
    setup('VIEWER');
    expect(hrefs()).toEqual(['/calendar', '/timetable', '/profile']);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ADMIN: 4 links, no create button', () => {
    setup('ADMIN');
    expect(hrefs()).toEqual(['/admin', '/calendar', '/admin/timetable', '/profile']);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('STUDENT_REP: bookings tab routes to /history and centre button opens /book-a-slot', () => {
    setup('STUDENT_REP');
    expect(hrefs()).toEqual(['/calendar', '/history', '/timetable', '/profile']);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('loc')).toHaveTextContent('/book-a-slot');
  });

  it('FACULTY: 2 + create + 2 layout', () => {
    setup('FACULTY');
    expect(hrefs()).toEqual(['/faculty', '/calendar', '/timetable', '/profile']);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('marks the active tab', () => {
    setup('VIEWER');
    expect(screen.getByRole('link', { name: 'Rooms' })).toHaveAttribute('aria-current', 'page');
  });

  // NEW-FE-3: the pending-transfer badge is only rendered for a tab with id 'history', but App.jsx gives reps
  // a 'bookings' tab — on mobile reps never see incoming transfer requests.
  it('[NEW-FE-3] rep sees the pending transfer badge on the Bookings tab', () => {
    setup('STUDENT_REP', { pendingTransferCount: 2 });
    expect(screen.getByRole('link', { name: /bookings/i })).toHaveTextContent('2');
  });
});

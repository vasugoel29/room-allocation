import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookingModal from '../../components/modals/BookingModal';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';
import { ist, runInIST } from '../utils/ist';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

// slot.date is the IST midnight of Tue 2026-10-20. Payload instants go through utils/timezone (explicit
// Asia/Kolkata), but the header/toast use toLocaleDateString() in the *browser* zone — in the UTC container
// they would read "Oct 19". Users are in IST, so the worker is switched to IST for this file.
runInIST();
const DATE = ist(2026, 10, 20);
const ROOMS = [
  { id: 5, name: 'R-501', type: 'Lecture Room', building: '5th Block' },
  { id: 6, name: 'CR-1', type: 'Committee Room', building: '5th Block' },
  { id: 7, name: 'R-502', type: 'Lab', building: '5th Block' },
];
const FACULTIES = [{ id: 21, name: 'Prof Fay', department: 'IT' }, { id: 22, name: 'Dr Gray', department: 'CS' }];
const slot = (over = {}) => ({ day: 'Tue', hour: 10, date: DATE, room_id: 5, ...over });

const setup = ({ user = USERS.STUDENT_REP, s = slot(), ctx = {}, routes = [] } = {}) => {
  const f = installFetch([
    ['GET', /\/api\/timetable\/faculty\/check\//, { isOccupied: false }],
    ['POST', '/api/bookings', { id: 900 }],
    ['POST', '/api/transfers/request', { id: 1 }],
    ['PATCH', /\/api\/bookings\/\d+\/cancel/, { ok: true }],
    ...routes,
  ]);
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const r = renderWithContext(<BookingModal slot={s} onClose={onClose} onSuccess={onSuccess} />, {
    ctx: { user, rooms: ROOMS, faculties: FACULTIES, ...ctx },
  });
  return { ...r, f, onClose, onSuccess, ue: userEvent.setup() };
};

const pickFaculty = async (ue, name) => {
  await ue.click(screen.getByLabelText('Search for faculty'));
  await ue.click(screen.getByText(name));
};
const submit = (ue) => ue.click(screen.getByRole('button', { name: /finalize allocation|request transfer/i }));

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('BookingModal', () => {
  it('renders as an accessible dialog with slot header', () => {
    setup();
    const dlg = screen.getByRole('dialog');
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: /reserve space/i })).toHaveTextContent('Tue, Oct 20 @ 10:00');
  });

  it('viewer: read-only — no submit button, nothing posted', async () => {
    const { f } = setup({ user: USERS.VIEWER });
    expect(screen.getByText('Read Only Registry')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finalize allocation/i })).toBeNull();
    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    await new Promise((r) => setTimeout(r, 20));
    expect(f).not.toHaveBeenCalled();
  });

  it('rep: requires a supervising faculty', async () => {
    const { ue, f } = setup();
    await submit(ue);
    expect(screen.getByText('Please select a faculty for this class')).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it('rep: checks faculty availability, then POSTs the IST-correct booking payload', async () => {
    const { ue, f, ctx, onSuccess } = setup();
    await pickFaculty(ue, 'Prof Fay');
    expect(screen.getByLabelText('Search for faculty')).toHaveAttribute('placeholder', 'Prof Fay');
    await ue.type(screen.getByPlaceholderText(/special class/i), 'Extra DBMS');
    await submit(ue);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const calls = fetchCalls(f);
    expect(calls[0]).toEqual(['GET', '/api/timetable/faculty/check/21?date=2026-10-20&hour=10', undefined]);
    expect(calls[1]).toEqual(['POST', '/api/bookings', {
      room_id: 5,
      start_time: '2026-10-20T04:30:00.000Z', // 10:00 IST
      end_time: '2026-10-20T05:30:00.000Z',
      faculty_id: 21,
      purpose: 'Extra DBMS',
      reschedule_room_name: null,
      reschedule_day: null,
      reschedule_hour: null,
    }]);
    expect(ctx.refreshAllData).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/^Request sent to Prof\. Prof Fay for Room R-501 from 10:00 to 11:00 on Oct 20, 2026\.$/));
  });

  it('faculty picker filters by debounced search term (name or department)', async () => {
    const { ue } = setup();
    await ue.type(screen.getByLabelText('Search for faculty'), 'cs');
    await waitFor(() => expect(screen.queryByText('Prof Fay')).toBeNull(), { timeout: 1000 });
    expect(screen.getByText('Dr Gray')).toBeInTheDocument();
    await ue.clear(screen.getByLabelText('Search for faculty'));
    await ue.type(screen.getByLabelText('Search for faculty'), 'zzz');
    expect(await screen.findByText('No faculty found')).toBeInTheDocument();
  });

  it('rep: busy faculty opens the conflict dialog and does not book', async () => {
    const { ue, f } = setup({ routes: [] });
    f.mockImplementation(async (url) => (url.includes('/faculty/check/') ? jsonResponse({ isOccupied: true }) : jsonResponse({})));
    await pickFaculty(ue, 'Prof Fay');
    await submit(ue);
    expect(await screen.findByText('Faculty Unavailable')).toBeInTheDocument();
    expect(fetchCalls(f).some(([m]) => m === 'POST')).toBe(false);
  });

  it('faculty check failure is non-blocking', async () => {
    const { ue, f, onSuccess } = setup();
    f.mockImplementation(async (url) => (url.includes('/faculty/check/') ? jsonResponse({}, 500) : jsonResponse({ id: 1 })));
    await pickFaculty(ue, 'Prof Fay');
    await submit(ue);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('faculty user: no faculty picker, faculty_id null, plain success toast', async () => {
    const { ue, f, onSuccess } = setup({ user: USERS.FACULTY });
    expect(screen.queryByLabelText('Search for faculty')).toBeNull();
    await submit(ue);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const post = fetchCalls(f).find(([m]) => m === 'POST');
    expect(post[2]).toMatchObject({ room_id: 5, faculty_id: null, purpose: '' });
    expect(fetchCalls(f).some(([, u]) => u.includes('/faculty/check/'))).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Success! Room R-501 has been booked for Tue at 10:00.');
  });

  it('students cannot book Committee Rooms (banner + disabled submit)', () => {
    setup({ s: slot({ room_id: 6 }) });
    expect(screen.getByText('Booking Restricted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finalize allocation/i })).toBeDisabled();
  });

  it('admin may book Committee Rooms', () => {
    setup({ user: USERS.ADMIN, s: slot({ room_id: 6 }) });
    expect(screen.queryByText('Booking Restricted')).toBeNull();
    expect(screen.getByRole('button', { name: /finalize allocation/i })).toBeEnabled();
  });

  it('slot without a room shows "Please select a room"', async () => {
    const { ue } = setup({ user: USERS.FACULTY, s: slot({ room_id: undefined }) });
    await submit(ue);
    expect(screen.getByText('Please select a room')).toBeInTheDocument();
  });

  it('reschedule: requires the freed room, then sends reschedule fields', async () => {
    const { ue, f, onSuccess } = setup({ user: USERS.FACULTY });
    await ue.click(screen.getByDisplayValue('Extra Class'));
    await ue.click(screen.getByText('Reschedule'));
    expect(screen.getByDisplayValue('Tue')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10:00')).toBeInTheDocument();
    await submit(ue);
    expect(screen.getByText('Please specify the room being freed up')).toBeInTheDocument();

    await ue.click(screen.getByDisplayValue('Tue'));
    await ue.click(screen.getByText('Wed'));
    await ue.click(screen.getByDisplayValue('10:00'));
    await ue.click(screen.getByText('14:00'));
    await ue.click(screen.getByLabelText('Search for room to free up'));
    await ue.click(screen.getByText('R-502'));
    await ue.type(screen.getByPlaceholderText(/special class/i), 'moved');
    await submit(ue);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchCalls(f).find(([m]) => m === 'POST')[2]).toMatchObject({
      purpose: 'Reschedule: moved', reschedule_room_name: 'R-502', reschedule_day: 'Wed', reschedule_hour: 14,
    });
  });

  it('reschedule room list hides Committee Rooms/Auditoriums for students', async () => {
    const { ue } = setup();
    await ue.click(screen.getByDisplayValue('Extra Class'));
    await ue.click(screen.getByText('Reschedule'));
    await ue.click(screen.getByLabelText('Search for room to free up'));
    expect(screen.getByText('R-502')).toBeInTheDocument();
    expect(screen.queryByText('CR-1')).toBeNull();
  });

  it('server error is displayed inline', async () => {
    const { ue, f } = setup({ user: USERS.FACULTY });
    f.mockImplementation(async () => jsonResponse({ error: 'Room already booked' }, 409));
    await submit(ue);
    expect(await screen.findByText('Room already booked')).toBeInTheDocument();
  });

  const booking = (over = {}) => ({ id: 77, room_id: 5, start_time: '2026-10-20T04:30:00.000Z', status: 'ACTIVE', created_by: 99, purpose: 'Club', class_name: 'IT-2', ...over });

  it("someone else's booking: header is Request Transfer and submit sends a transfer request", async () => {
    const { ue, f, onSuccess } = setup({ ctx: { bookings: [booking()] } });
    expect(screen.getByRole('heading', { name: /request transfer/i })).toBeInTheDocument();
    await pickFaculty(ue, 'Dr Gray');
    await ue.type(screen.getByPlaceholderText(/special class/i), 'need it');
    await submit(ue);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchCalls(f).find(([m]) => m === 'POST')).toEqual(['POST', '/api/transfers/request', { booking_id: 77, target_faculty_id: 22, new_purpose: 'need it' }]);
    expect(toast.success).toHaveBeenCalledWith('Transfer request sent successfully!');
  });

  it('[SEC-10] limited view of someone else\'s booking shows who holds it (name · class), never a purpose', () => {
    setup({ ctx: { bookings: [booking({ purpose: undefined, visibility: 'limited', user_name: 'Arjun Sharma', class_name: 'IT-2 3rd Year', can_request_transfer: true })] } });
    expect(screen.getByTestId('booked-by')).toHaveTextContent('Arjun Sharma · IT-2 3rd Year');
    expect(screen.queryByText(/purpose/i)).toBeNull();
    expect(screen.getByRole('button', { name: /request transfer/i })).toBeEnabled();
  });

  it('[SEC-10] Request Transfer is disabled when the server says the booking cannot be transferred', () => {
    setup({ ctx: { bookings: [booking({ visibility: 'limited', user_name: 'Arjun Sharma', can_request_transfer: false })] } });
    expect(screen.getByRole('button', { name: /request transfer/i })).toBeDisabled();
    expect(screen.getByTestId('booked-by')).toHaveTextContent(/can't be transferred/i);
  });

  it('own booking: shows details and cancels via PATCH', async () => {
    const { ue, f, onSuccess } = setup({ ctx: { bookings: [booking({ created_by: USERS.STUDENT_REP.id })] } });
    expect(screen.getByRole('heading', { name: /booking details/i })).toBeInTheDocument();
    expect(screen.getByText('Club')).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /cancel booking/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(fetchCalls(f)).toEqual([['PATCH', '/api/bookings/77/cancel', undefined]]);
  });

  it('CANCELLED bookings and other hours are ignored when matching the slot', () => {
    setup({ ctx: { bookings: [booking({ status: 'CANCELLED' }), booking({ id: 78, start_time: '2026-10-20T05:30:00.000Z' })] } });
    expect(screen.getByRole('heading', { name: /reserve space/i })).toBeInTheDocument();
  });

  it('Escape and the close button call onClose', async () => {
    const { ue, onClose } = setup();
    await ue.keyboard('{Escape}');
    await ue.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // FE-07: booking-type and faculty options are clickable <div>s — unreachable by keyboard / screen readers.
  it.fails('[FE-07] booking type options are exposed as keyboard-operable controls', async () => {
    const { ue } = setup();
    await ue.click(screen.getByDisplayValue('Extra Class'));
    expect(screen.getByRole('option', { name: 'Reschedule' })).toBeInTheDocument();
  });
});

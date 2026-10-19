import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authService } from '../../services/authService';
import { bookingService } from '../../services/bookingService';
import { roomService } from '../../services/roomService';
import { adminService } from '../../services/adminService';
import { facultyService } from '../../services/facultyService';
import { jsonResponse } from '../utils/http';

let fetchMock;
const last = () => {
  const [url, init = {}] = fetchMock.mock.calls.at(-1);
  return { method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined };
};

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const failWith = (status, body) => fetchMock.mockResolvedValueOnce(jsonResponse(body, status));

describe('authService', () => {
  it('getCalendar / getMine hit the bounded endpoints and unwrap data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1 }], meta: {} }));
    expect(await bookingService.getCalendar('2026-10-19', '2026-11-01')).toEqual([{ id: 1 }]);
    expect(last().url).toBe('/api/bookings/calendar?from=2026-10-19&to=2026-11-01');
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 2 }] }));
    expect(await bookingService.getMine()).toEqual([{ id: 2 }]);
    expect(last().url).toBe('/api/bookings/mine');
  });

  it.each([
    ['googleLogin', () => authService.googleLogin('cred'), 'POST', '/api/auth/google', { credential: 'cred' }],
    ['devLogin', () => authService.devLogin('a@nsut.ac.in'), 'POST', '/api/auth/dev-login', { email: 'a@nsut.ac.in' }],
    ['logout', () => authService.logout(), 'POST', '/api/auth/logout', undefined],
    ['getFaculties', () => authService.getFaculties(), 'GET', '/api/auth/faculties', undefined],
  ])('%s -> %s %s', async (_n, call, method, url, body) => {
    await call();
    expect(last()).toEqual({ method, url, body });
  });

  it('getUsers serialises filters and unwraps {data}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1 }], meta: {} }));
    expect(await authService.getUsers({ role: 'FACULTY', page: 2 })).toEqual([{ id: 1 }]);
    expect(last().url).toBe('/api/auth/users?role=FACULTY&page=2');
    await authService.getUsers();
    expect(last().url).toBe('/api/auth/users');
  });

  it('googleLogin / devLogin surface the server error, fall back to generic', async () => {
    failWith(403, { error: 'Not in the college directory' });
    await expect(authService.googleLogin('c')).rejects.toThrow('Not in the college directory');
    failWith(400, {});
    await expect(authService.googleLogin('c')).rejects.toThrow('Google sign-in failed');
    failWith(403, { error: 'Account deactivated' });
    await expect(authService.devLogin('a')).rejects.toThrow('Account deactivated');
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(authService.devLogin('a')).rejects.toThrow('Dev sign-in failed');
  });

  it('me unwraps {user}', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: 3 } }));
    expect(await authService.me()).toEqual({ id: 3 });
    expect(last()).toEqual({ method: 'GET', url: '/api/auth/me', body: undefined });
  });

  it('no local-account functions remain (accounts live in the college ACL)', () => {
    for (const fn of ['login', 'signup', 'forgotPassword', 'resetPassword', 'verifyStudent', 'createUser', 'updateUser']) {
      expect(authService[fn]).toBeUndefined();
    }
    for (const fn of ['createUser', 'updateUser', 'approveUser', 'getPromotions']) {
      expect(adminService[fn]).toBeUndefined();
    }
  });
});

describe('bookingService', () => {
  it('getBookings builds query string and unwraps paginated data', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1 }], meta: { total: 1 } }));
    expect(await bookingService.getBookings({ limit: 1000 })).toEqual([{ id: 1 }]);
    expect(last()).toEqual({ method: 'GET', url: '/api/bookings?limit=1000', body: undefined });
    fetchMock.mockResolvedValueOnce(jsonResponse([{ id: 2 }]));
    expect(await bookingService.getBookings()).toEqual([{ id: 2 }]);
    expect(last().url).toBe('/api/bookings');
  });

  it.each([
    ['createBooking', () => bookingService.createBooking({ room_id: 1 }), 'POST', '/api/bookings', { room_id: 1 }],
    ['rescheduleBooking', () => bookingService.rescheduleBooking(3, { a: 1 }), 'POST', '/api/bookings/3/reschedule', { a: 1 }],
    ['cancelBooking', () => bookingService.cancelBooking(3), 'PATCH', '/api/bookings/3/cancel', undefined],
    ['incoming', () => bookingService.getIncomingTransfers(), 'GET', '/api/transfers/incoming', undefined],
    ['outgoing', () => bookingService.getOutgoingTransfers(), 'GET', '/api/transfers/outgoing', undefined],
    ['requestTransfer', () => bookingService.requestTransfer({ booking_id: 2 }), 'POST', '/api/transfers/request', { booking_id: 2 }],
    ['transfer accept', () => bookingService.handleTransferAction(8, 'accept'), 'PATCH', '/api/transfers/8/accept', undefined],
  ])('%s', async (_n, call, method, url, body) => {
    await call();
    expect(last()).toEqual({ method, url, body });
  });

  it('createBooking error carries server conflict payload', async () => {
    failWith(409, { error: 'Faculty busy', conflict: { type: 'faculty_busy' } });
    const err = await bookingService.createBooking({}).catch((e) => e);
    expect(err.message).toBe('Faculty busy');
    expect(err.conflict).toEqual({ type: 'faculty_busy' });
  });

  it('cancelBooking error message', async () => {
    failWith(403, { error: 'Not yours' });
    await expect(bookingService.cancelBooking(1)).rejects.toThrow('Not yours');
  });
});

describe('roomService', () => {
  it('getRooms expands array filters into repeated params and skips null/undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await roomService.getRooms({ building: ['5th Block', 'Other'], floor: 0, type: undefined, x: null });
    expect(last().url).toBe('/api/rooms?building=5th+Block&building=Other&floor=0');
  });

  it.each([
    ['getAvailability', () => roomService.getAvailability(), 'GET', '/api/availability'],
    ['getHealth', () => roomService.getHealth(), 'GET', '/api/health'],
    ['getDepartments', () => roomService.getDepartments(), 'GET', '/api/departments'],
    ['getMyAvailability', () => roomService.getMyAvailability(), 'GET', '/api/availability/my'],
    ['getTimetable', () => roomService.getTimetable({ semester: [3, 5] }), 'GET', '/api/timetable?semester=3&semester=5'],
    ['getFacultyTimetable', () => roomService.getFacultyTimetable(), 'GET', '/api/timetable/faculty'],
    ['checkFacultyAvailability', () => roomService.checkFacultyAvailability(21, '2026-10-20', 9), 'GET', '/api/timetable/faculty/check/21?date=2026-10-20&hour=9'],
    ['getFacultyOverrides', () => roomService.getFacultyOverrides(), 'GET', '/api/timetable/faculty/overrides'],
    ['getRoomWeekSchedule', () => roomService.getRoomWeekSchedule(4, '2026-10-19'), 'GET', '/api/rooms/4/week-schedule?weekStart=2026-10-19'],
    ['checkRoomConflict', () => roomService.checkRoomConflict(4, '2026-10-20', 9, 10), 'GET', '/api/rooms/4/conflict-check?date=2026-10-20&startHour=9&endHour=10'],
  ])('%s', async (_n, call, method, url) => {
    await call();
    expect(last()).toMatchObject({ method, url });
  });

  it.each([
    ['createAvailabilityOverride', () => roomService.createAvailabilityOverride({ a: 1 }), '/api/availability/override'],
    ['overrideFacultySlot', () => roomService.overrideFacultySlot({ a: 1 }), '/api/timetable/faculty/override'],
    ['requestClassCancellation', () => roomService.requestClassCancellation({ a: 1 }), '/api/timetable/cancellation-requests'],
  ])('%s POSTs JSON', async (_n, call, url) => {
    await call();
    expect(last()).toEqual({ method: 'POST', url, body: { a: 1 } });
  });

  it('getHealth throws on non-OK (drives the connection-error screen)', async () => {
    failWith(500, {});
    await expect(roomService.getHealth()).rejects.toThrow('Health check failed');
  });
});

describe('adminService', () => {
  it('getAdminData fetches only the bookings page (no promotions request) and unwraps', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: 1 }], meta: { page: 1, totalPages: 3 } }));
    const out = await adminService.getAdminData('S', 'E', 2, 50);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/bookings/admin/all?start_date=S&end_date=E&page=2&limit=50',
    ]);
    expect(out).toEqual({ bookings: [{ id: 1 }], bookingsMeta: { page: 1, totalPages: 3 } });
  });

  it('getAdminData throws if the request fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(adminService.getAdminData('S', 'E')).rejects.toThrow('Failed to fetch admin data');
  });

  it.each([
    ['getUsers', () => adminService.getUsers(3), 'GET', '/api/auth/users?page=3&limit=20&search=&role=', undefined],
    ['getRoomStatuses', () => adminService.getRoomStatuses('2026-10-20', 9), 'GET', '/api/rooms/admin/status?date=2026-10-20&slot=9', undefined],
    ['getDepartments', () => adminService.getDepartments({ q: 'IT', x: null }), 'GET', '/api/departments?q=IT', undefined],
    ['getBranches', () => adminService.getBranches({ department_id: 2 }), 'GET', '/api/branches?department_id=2', undefined],
    ['deactivateUser', () => adminService.deactivateUser(5), 'DELETE', '/api/auth/users/5', undefined],
    ['quickBook', () => adminService.quickBook({ room_name: 'R', date: 'D', slot: 9 }), 'POST', '/api/bookings/admin/quick', { room_name: 'R', date: 'D', slot: 9 }],
    ['fetchAuditLogs', () => adminService.fetchAuditLogs(2, 'x'), 'GET', '/api/admin/audit-logs?page=2&search=x', undefined],
    ['fetchAnalytics', () => adminService.fetchAnalytics(7), 'GET', '/api/admin/analytics?days=7', undefined],
    ['importCSV', () => adminService.importCSV('rooms', 'a,b'), 'POST', '/api/admin/uploads/import/rooms', { csvContent: 'a,b' }],
    ['createRoom', () => adminService.createRoom({ name: 'R' }), 'POST', '/api/rooms', { name: 'R' }],
    ['updateRoom', () => adminService.updateRoom(2, { name: 'R' }), 'PATCH', '/api/rooms/2', { name: 'R' }],
    ['deleteRoom', () => adminService.deleteRoom(2), 'DELETE', '/api/rooms/2', undefined],
    ['createDepartment', () => adminService.createDepartment('IT'), 'POST', '/api/departments', { name: 'IT' }],
    ['updateDepartment', () => adminService.updateDepartment(1, 'CS'), 'PATCH', '/api/departments/1', { name: 'CS' }],
    ['deleteDepartment', () => adminService.deleteDepartment(1), 'DELETE', '/api/departments/1', undefined],
    ['createBranch', () => adminService.createBranch({ n: 1 }), 'POST', '/api/branches', { n: 1 }],
    ['pollJobStatus', () => adminService.pollJobStatus('j1'), 'GET', '/api/admin/uploads/status/j1', undefined],
    ['listTimetableSlots', () => adminService.listTimetableSlots({ faculty_name: 'Dr X', day_of_week: 'Mon' }), 'GET', '/api/timetable/slots?faculty_name=Dr+X&day_of_week=Mon&page=1&limit=50', undefined],
    ['createTimetableSlot', () => adminService.createTimetableSlot({ a: 1 }), 'POST', '/api/timetable/slots', { a: 1 }],
    ['deleteTimetableSlot', () => adminService.deleteTimetableSlot(4), 'DELETE', '/api/timetable/slots/4', undefined],
  ])('%s', async (_n, call, method, url, body) => {
    await call();
    expect(last()).toEqual({ method, url, body });
  });

  it('exportCSV / exportXLSX / downloadTemplate return blobs and encode params', async () => {
    fetchMock.mockImplementation(async () => new Response('a,b', { status: 200 }));
    const blob = await adminService.exportCSV('bookings', { from: '2026-10-01', to: '2026-10-31' });
    expect(await blob.text()).toBe('a,b');
    expect(last().url).toBe('/api/admin/export/bookings?from=2026-10-01&to=2026-10-31');
    await adminService.exportCSV('users');
    expect(last().url).toBe('/api/admin/export/users');
    await adminService.exportXLSX('timetable', 'by faculty');
    expect(last().url).toBe('/api/admin/uploads/export/timetable?view=by%20faculty');
    await adminService.downloadTemplate('rooms');
    expect(last().url).toBe('/api/admin/uploads/template/rooms');
  });

  // NEW-FE-2: search text is interpolated raw into the query string; "R&D" splits into search=R + a stray "D" param.
  it.fails('[NEW-FE-2] fetchAuditLogs URL-encodes the search term', async () => {
    await adminService.fetchAuditLogs(1, 'R&D #2');
    expect(last().url).toBe('/api/admin/audit-logs?page=1&search=R%26D%20%232');
  });

  it('pollJobStatus maps 404 to not_found', async () => {
    failWith(404, {});
    expect(await adminService.pollJobStatus('gone')).toEqual({ status: 'not_found' });
  });

  it('deactivateUser/quickBook propagate server error text', async () => {
    failWith(400, { error: 'You cannot deactivate yourself' });
    await expect(adminService.deactivateUser(1)).rejects.toThrow('You cannot deactivate yourself');
    failWith(500, {});
    await expect(adminService.deactivateUser(1)).rejects.toThrow('Deactivation failed');
    failWith(400, { error: 'room_name, date and slot are required' });
    await expect(adminService.quickBook({})).rejects.toThrow('room_name, date and slot are required');
  });
});

describe('facultyService', () => {
  it.each([
    ['getPendingRequests', () => facultyService.getPendingRequests(), 'GET', '/api/faculty/pending', undefined],
    ['handleRequest', () => facultyService.handleRequest(4, 'approve'), 'PATCH', '/api/faculty/4/approve', undefined],
  ])('%s', async (_n, call, method, url, body) => {
    await call();
    expect(last()).toEqual({ method, url, body });
  });

  it('handleRequest error fallbacks mention the action', async () => {
    failWith(500, {});
    await expect(facultyService.handleRequest(1, 'reject')).rejects.toThrow('Failed to reject request');
  });
});

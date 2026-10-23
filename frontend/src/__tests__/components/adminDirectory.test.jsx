import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminDashboard from '../../pages/AdminDashboard';
import AdminUploads from '../../features/admin/AdminUploads';
import Profile from '../../pages/Profile';
import { renderWithContext, USERS } from '../utils/renderWithContext';
import { installFetch, fetchCalls } from '../utils/http';

// Unrelated heavy tabs (recharts etc.) are stubbed; these tests cover users/profile/uploads only.
vi.mock('../../features/admin/AdminAnalytics', () => ({ default: () => null }));
vi.mock('../../pages/AdminTimetable', () => ({ default: () => null }));
vi.mock('../../pages/RoomScheduleGrid', () => ({ default: () => null }));

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  localStorage.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const DIRECTORY = [
  { id: 1, name: 'Ada Admin', email: 'admin@nsut.ac.in', role: 'ADMIN' },
  { id: 21, name: 'Prof Fay', email: 'fay@nsut.ac.in', role: 'FACULTY', department_name: 'Information Technology' },
  { id: 12, name: 'Rita Rep', email: 'rep@nsut.ac.in', role: 'STUDENT_REP', branch: 'IT', year: 3, section: 2, department_name: 'Information Technology' },
];

describe('Admin Users tab (read-only directory mirror)', () => {
  const setup = () => {
    const f = installFetch([
      ['GET', /\/api\/auth\/users\?/, { data: DIRECTORY, meta: { page: 1, totalPages: 1 } }],
      ['GET', /\/api\/bookings\/admin\/all/, { data: [], meta: { page: 1, totalPages: 1 } }],
      ['DELETE', /\/api\/auth\/users\/\d+$/, { id: 12 }],
    ]);
    renderWithContext(<AdminDashboard />, { route: '/admin?tab=users', ctx: { user: USERS.ADMIN } });
    return { f, ue: userEvent.setup() };
  };
  const desktopRow = (name) => screen.getAllByText(name).map((el) => el.closest('tr')).find(Boolean);

  it('lists role, branch/year/section, department and status with no editing controls', async () => {
    const { f } = setup();
    const row = await waitFor(() => desktopRow('Rita Rep'));
    expect(within(row).getByText('IT • Year 3 • Sec 2')).toBeInTheDocument();
    expect(within(row).getByText('Information Technology')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    expect(within(row).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(['Deactivate']);
    expect(screen.getByText(/come from the institutional directory/i)).toBeInTheDocument();

    for (const gone of [/add user/i, /^edit$/i, /approve/i, /reset password/i]) {
      expect(screen.queryByRole('button', { name: gone })).toBeNull();
    }
    expect(screen.queryByText(/pending approval/i)).toBeNull();
    // The old Requests (promotions) tab and its per-load fetch are gone.
    expect(screen.queryByRole('button', { name: /^requests/i })).toBeNull();
    expect(fetchCalls(f).some(([, u]) => u.includes('/promotions'))).toBe(false);
  });

  it('search is sent to the server list endpoint', async () => {
    const { f, ue } = setup();
    await waitFor(() => desktopRow('Rita Rep'));
    await ue.type(screen.getByPlaceholderText('Search users...'), 'rit');
    await waitFor(() => expect(fetchCalls(f).some(([, u]) => u.includes('search=rit'))).toBe(true));
  });

  it('Deactivate asks for confirmation, explains the effect, then DELETEs and refetches', async () => {
    const { f, ue } = setup();
    const row = await waitFor(() => desktopRow('Rita Rep'));
    await ue.click(within(row).getByRole('button', { name: 'Deactivate Rita Rep' }));

    const dialog = screen.getByRole('dialog', { name: 'Deactivate User' });
    expect(dialog).toHaveTextContent(/no longer be able to sign in to CRAS/);
    expect(dialog).toHaveTextContent(/upcoming bookings will be cancelled/);
    expect(fetchCalls(f).some(([m]) => m === 'DELETE')).toBe(false);

    const lists = () => fetchCalls(f).filter(([m, u]) => m === 'GET' && u.includes('/auth/users')).length;
    const before = lists();
    await ue.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['DELETE', '/api/auth/users/12', undefined]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('User deactivated'));
    await waitFor(() => expect(lists()).toBe(before + 1));
  });

  it('cancelling the confirm sends nothing', async () => {
    const { f, ue } = setup();
    const row = await waitFor(() => desktopRow('Prof Fay'));
    await ue.click(within(row).getByRole('button', { name: 'Deactivate Prof Fay' }));
    await ue.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchCalls(f).some(([m]) => m === 'DELETE')).toBe(false);
  });

  it('a deactivated row shows its status and offers no action', async () => {
    installFetch([
      ['GET', /\/api\/auth\/users\?/, { data: [{ ...DIRECTORY[2], is_active: false }], meta: { page: 1, totalPages: 1 } }],
      ['GET', /\/api\/bookings\/admin\/all/, { data: [] }],
    ]);
    renderWithContext(<AdminDashboard />, { route: '/admin?tab=users', ctx: { user: USERS.ADMIN } });
    const row = await waitFor(() => desktopRow('Rita Rep'));
    expect(within(row).getByText('Deactivated')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).toBeNull();
  });
});

describe('Profile (read-only, from the institutional directory)', () => {
  it('shows the ACL profile with no editing controls and makes no API call', () => {
    const f = installFetch([]);
    const user = { ...USERS.STUDENT_REP, department_name: 'Information Technology', academic: { roll_no: '2023UIT1001', degree: 'B.Tech' } };
    const { ctx } = renderWithContext(<Profile />, { ctx: { user } });
    expect(screen.getByRole('heading', { name: 'Rita Rep' })).toBeInTheDocument();
    expect(screen.getByText('rep@nsut.ac.in')).toBeInTheDocument();
    expect(screen.getByText('Information Technology')).toBeInTheDocument();
    expect(screen.getByText('IT')).toBeInTheDocument();
    expect(screen.getByText(/Semester 5\s*· Section 1/)).toBeInTheDocument();
    expect(screen.getByText('2023UIT1001')).toBeInTheDocument();
    expect(screen.getByText(/come from the institutional directory/i)).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /edit profile/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();

    expect(screen.queryByRole('button', { name: 'Toggle Theme' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /logout securely/i }));
    expect(ctx.logout).toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
  });

  it('admins see no department', () => {
    installFetch([]);
    renderWithContext(<Profile />, { ctx: { user: USERS.ADMIN } });
    expect(screen.queryByText('Department')).toBeNull();
  });
});

describe('Admin CSV uploads', () => {
  const upload = (container, index, text) => {
    const input = container.querySelectorAll('input[type="file"]')[index];
    fireEvent.change(input, { target: { files: [new File([text], 'f.csv', { type: 'text/csv' })] } });
  };

  it('students are export-only; faculty and timetable keep template/import', () => {
    installFetch([]);
    const { container } = renderWithContext(<AdminUploads />, { ctx: { user: USERS.ADMIN } });
    expect(screen.queryByText(/upload students csv/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'Export students' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /template/i })).toHaveLength(2);
    expect(screen.getByText(/upload faculty csv/i)).toBeInTheDocument();
    expect(screen.getByText(/upload timetable csv/i)).toBeInTheDocument();
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(2);
    expect(screen.getByText('name,email,department_name,status')).toBeInTheDocument();
    expect(screen.getByText('status=inactive')).toBeInTheDocument();
  });

  it('template downloads hit the faculty/timetable template endpoints only', async () => {
    const f = installFetch([['GET', /\/api\/admin\/uploads\/template\//, () => new Response('a,b')]]);
    window.URL.createObjectURL = vi.fn(() => 'blob:x');
    window.URL.revokeObjectURL = vi.fn();
    renderWithContext(<AdminUploads />, { ctx: { user: USERS.ADMIN } });
    for (const b of screen.getAllByRole('button', { name: /template/i })) fireEvent.click(b);
    await waitFor(() => expect(fetchCalls(f).map(([, u]) => u)).toEqual([
      '/api/admin/uploads/template/faculty',
      '/api/admin/uploads/template/timetable',
    ]));
  });

  it('faculty import shows the summary and lists skipped rows (line + reason)', async () => {
    const f = installFetch([
      ['POST', '/api/admin/uploads/import/faculty', { jobId: 'j1', status: 'processing' }],
      ['GET', '/api/admin/uploads/status/j1', {
        status: 'completed',
        message: 'Faculty directory updated: 1 added, 0 updated, 1 deactivated, 2 skipped',
        created: 1, updated: 0, deactivated: 1,
        skipped: [{ line: 3, reason: 'invalid or missing email' }, { line: 5, reason: 'duplicate of line 2' }],
      }],
    ]);
    const { container } = renderWithContext(<AdminUploads />, { ctx: { user: USERS.ADMIN } });
    const csv = 'name,email,department_name,status\nDr A,a@nsut.ac.in,IT,\n';
    upload(container, 0, csv);
    await waitFor(() => expect(fetchCalls(f)).toContainEqual(['POST', '/api/admin/uploads/import/faculty', { csvContent: csv }]));

    const result = await screen.findByTestId('faculty-import-result', {}, { timeout: 4000 });
    expect(result).toHaveTextContent('Faculty directory updated: 1 added, 0 updated, 1 deactivated, 2 skipped');
    expect(within(result).getByText('Line 3: invalid or missing email')).toBeInTheDocument();
    expect(within(result).getByText('Line 5: duplicate of line 2')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Faculty directory updated: 1 added, 0 updated, 1 deactivated, 2 skipped');
  });

  it('no skipped list when every row applied', async () => {
    installFetch([
      ['POST', '/api/admin/uploads/import/timetable', { jobId: 'j2' }],
      ['GET', '/api/admin/uploads/status/j2', { status: 'completed', message: 'Successfully imported 4 timetable records' }],
    ]);
    const { container } = renderWithContext(<AdminUploads />, { ctx: { user: USERS.ADMIN } });
    upload(container, 1, 'a,b\n1,2\n');
    const result = await screen.findByTestId('timetable-import-result', {}, { timeout: 4000 });
    expect(result).toHaveTextContent('Successfully imported 4 timetable records');
    expect(within(result).queryByText(/skipped rows/i)).toBeNull();
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminUserModal from '../../components/modals/AdminUserModal';
import { installFetch, fetchCalls, jsonResponse } from '../utils/http';

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toast, toast };
});
import toast from 'react-hot-toast';

const DEPTS = [{ id: 1, name: 'Information Technology' }, { id: 2, name: 'Administration' }];

const setup = ({ editingUser = null, routes = [] } = {}) => {
  const f = installFetch([...routes, ['POST', '/api/auth/users', { id: 50 }], ['PATCH', /\/api\/auth\/users\/\d+/, { id: 5 }]]);
  const onClose = vi.fn();
  const fetchUsers = vi.fn();
  render(<AdminUserModal isOpen onClose={onClose} editingUser={editingUser} fetchUsers={fetchUsers} departments={DEPTS} />);
  return { f, onClose, fetchUsers, ue: userEvent.setup() };
};

const fillCommon = async (ue, { name = 'New Person', email = 'new@nsut.ac.in', dept = 'Administration' } = {}) => {
  await ue.type(screen.getByPlaceholderText('e.g. John Doe'), name);
  await ue.type(screen.getByPlaceholderText('john@campus.edu'), email);
  await ue.click(screen.getByPlaceholderText('Select or type department'));
  await ue.click(screen.getByText(dept));
};
const chooseRole = async (ue, current, label) => {
  await ue.click(screen.getByRole('button', { name: current }));
  await ue.click(screen.getByText(label));
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('AdminUserModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AdminUserModal isOpen={false} onClose={() => {}} fetchUsers={() => {}} departments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('create VIEWER: posts name/email/password/department + student fields', async () => {
    const { ue, f, onClose, fetchUsers } = setup();
    await fillCommon(ue, { dept: 'Information Technology' });
    await ue.type(screen.getByPlaceholderText('e.g. CSE, IT, ECE'), 'IT');
    await chooseRole(ue, /semester 1/i, 'Semester 5');
    await ue.type(screen.getByPlaceholderText('••••••••'), 'secret12');
    await ue.click(screen.getByRole('button', { name: /establish access/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchCalls(f)[0]).toEqual(['POST', '/api/auth/users', {
      name: 'New Person', email: 'new@nsut.ac.in', role: 'VIEWER', password: 'secret12', branch: 'IT',
      year: 3, semester: 5, section: 1, group_name: 1, departmentName: 'Information Technology',
    }]);
    expect(fetchUsers).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('User created');
  });

  it('student fields disappear for FACULTY', async () => {
    const { ue } = setup();
    expect(screen.getByPlaceholderText('e.g. CSE, IT, ECE')).toBeInTheDocument();
    await chooseRole(ue, /viewer \(student\)/i, 'FACULTY (Staff)');
    expect(screen.queryByPlaceholderText('e.g. CSE, IT, ECE')).toBeNull();
  });

  it('edit mode PATCHes the user, hides password', async () => {
    const editingUser = { id: 5, name: 'Old', email: 'old@nsut.ac.in', role: 'FACULTY', department_name: 'Information Technology' };
    const { ue, f } = setup({ editingUser });
    expect(screen.getByText('Edit Registry')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('••••••••')).toBeNull();
    expect(screen.getByRole('button', { name: /faculty \(staff\)/i })).toBeInTheDocument();
    await ue.click(screen.getByRole('button', { name: /synchronize registry/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('User updated'));
    expect(fetchCalls(f)[0][0]).toBe('PATCH');
    expect(fetchCalls(f)[0][1]).toBe('/api/auth/users/5');
    expect(fetchCalls(f)[0][2]).toMatchObject({ name: 'Old', role: 'FACULTY', departmentName: 'Information Technology' });
  });

  it('server error toasts and keeps the modal open', async () => {
    const { ue, onClose } = setup({ routes: [['POST', '/api/auth/users', () => jsonResponse({ error: 'Email already exists' }, 409)]] });
    await fillCommon(ue);
    await chooseRole(ue, /viewer \(student\)/i, 'FACULTY (Staff)');
    await ue.type(screen.getByPlaceholderText('••••••••'), 'secret12');
    await ue.click(screen.getByRole('button', { name: /establish access/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Email already exists'));
    expect(onClose).not.toHaveBeenCalled();
  });

  // FE-03: the ADMIN option's value is lowercase 'admin'; the backend stores it verbatim and every
  // role check compares against 'ADMIN' → the new "admin" has no rights at all.
  it.fails('[FE-03] creating an ADMIN sends role "ADMIN"', async () => {
    const { ue, f } = setup();
    await fillCommon(ue);
    await chooseRole(ue, /viewer \(student\)/i, 'ADMIN (Root Access)');
    await ue.type(screen.getByPlaceholderText('••••••••'), 'secret12');
    await ue.click(screen.getByRole('button', { name: /establish access/i }));
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(fetchCalls(f)[0][2].role).toBe('ADMIN');
  });

  it.fails('[FE-03] editing an existing ADMIN shows the ADMIN role selected', () => {
    setup({ editingUser: { id: 1, name: 'Root', email: 'r@nsut.ac.in', role: 'ADMIN' } });
    expect(screen.getByRole('button', { name: /admin \(root access\)/i })).toBeInTheDocument();
  });
});

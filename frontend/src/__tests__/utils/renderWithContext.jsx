import React from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../../context/AppContext';

// Each test person carries the permissions the ACL would grant their role (suggested bundles).
const B = {
  VIEWER: ['cras.calendar', 'cras.timetable'],
  STUDENT_REP: ['cras.calendar', 'cras.timetable', 'cras.bookings'],
  FACULTY: ['cras.calendar', 'cras.timetable', 'cras.bookings.direct', 'cras.faculty_portal'],
  ADMIN: ['cras.calendar', 'cras.timetable', 'cras.bookings', 'cras.bookings.direct', 'cras.admin'],
};
export const USERS = {
  VIEWER: { id: 11, name: 'Vik Viewer', email: 'viewer@nsut.ac.in', role: 'VIEWER', permissions: B.VIEWER, branch: 'IT', section: 1, semester: 5, year: 3 },
  STUDENT_REP: { id: 12, name: 'Rita Rep', email: 'rep@nsut.ac.in', role: 'STUDENT_REP', permissions: B.STUDENT_REP, branch: 'IT', section: 1, semester: 5, year: 3 },
  // faculty_id is the faculty-directory id (a different id space from user ids, as in the API).
  FACULTY: { id: 21, faculty_id: 500021, name: 'Prof Fay', email: 'fay@nsut.ac.in', role: 'FACULTY', permissions: B.FACULTY, department_name: 'IT' },
  ADMIN: { id: 1, name: 'Ada Admin', email: 'admin@nsut.ac.in', role: 'ADMIN', permissions: B.ADMIN },
};

/** A full AppContext value with inert defaults; override any key. */
export function makeContext(overrides = {}) {
  return {
    user: USERS.STUDENT_REP,
    setUser: vi.fn(),
    rooms: [],
    faculties: [],
    incomingTransfers: [],
    outgoingTransfers: [],
    pendingTransferCount: 0,
    bookings: [],
    availability: [],
    filters: { smartRoom: false, searchTerm: '', floor: 'all', building: ['5th Block'], roomType: 'all' },
    setFilters: vi.fn(),
    theme: 'light',
    setTheme: vi.fn(),
    viewMode: 'day',
    setViewMode: vi.fn(),
    selectedDay: '2026-10-20',
    setSelectedDay: vi.fn(),
    deferredPrompt: null,
    clearInstallPrompt: vi.fn(),
    backendError: null,
    fetchRooms: vi.fn(),
    fetchFaculties: vi.fn(),
    fetchBookings: vi.fn(),
    fetchAvailability: vi.fn(),
    timetableData: [],
    facultyTimetableData: {},
    facultyOverrides: [],
    fetchTimetable: vi.fn(),
    fetchFacultyOverrides: vi.fn(),
    fetchTransfers: vi.fn(),
    refreshAllData: vi.fn(),
    logout: vi.fn(),
    ...overrides,
  };
}

export function renderWithContext(ui, { ctx = {}, route = '/' } = {}) {
  const value = makeContext(ctx);
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <AppContext.Provider value={value}>{ui}</AppContext.Provider>
    </MemoryRouter>,
  );
  return { ...utils, ctx: value };
}

/**
 * CRAS authorization policy: the single place that decides what a principal may do.
 *
 * Permissions come from the central ACL (`permissions` in the /v1/user-access response).
 * Until the ACL defines permission strings for every app action, each role also carries a
 * default set below that reproduces the app's historical role gates exactly; ACL grants are
 * added on top. Tighten by removing defaults once the ACL publishes the full catalogue.
 */

export const PERMISSIONS = Object.freeze({
  ROOMS_VIEW: 'rooms:view',
  ROOMS_BOOK: 'rooms:book',
  ROOMS_MANAGE: 'rooms:manage',
  AVAILABILITY_OVERRIDE: 'availability:override',
  BOOKINGS_TRANSFER: 'bookings:transfer',
  BOOKINGS_APPROVE: 'bookings:approve',
  BOOKINGS_MANAGE: 'bookings:manage',
  TIMETABLE_VIEW: 'timetable:view',
  TIMETABLE_FACULTY: 'timetable:faculty',
  TIMETABLE_MANAGE: 'timetable:manage',
  CANCELLATION_REQUEST: 'cancellations:request',
  CANCELLATION_REVIEW: 'cancellations:review',
  USERS_MANAGE: 'users:manage',
  DIRECTORY_MANAGE: 'directory:manage',
  ADMIN_REPORTS: 'admin:reports',
  ADMIN_IMPORTS: 'admin:imports',
});

const P = PERMISSIONS;

/** Wildcard granted to admins. */
export const ALL = '*';

const VIEWER = [P.ROOMS_VIEW, P.TIMETABLE_VIEW];
const STUDENT_REP = [...VIEWER, P.ROOMS_BOOK, P.BOOKINGS_TRANSFER, P.AVAILABILITY_OVERRIDE, P.CANCELLATION_REQUEST];
const FACULTY = [...STUDENT_REP, P.BOOKINGS_APPROVE, P.TIMETABLE_FACULTY, P.CANCELLATION_REVIEW];

export const ROLE_DEFAULT_PERMISSIONS = Object.freeze({
  VIEWER,
  STUDENT_REP,
  FACULTY,
  ADMIN: [ALL],
});

export const ROLES = Object.freeze(['VIEWER', 'STUDENT_REP', 'FACULTY', 'ADMIN']);

const ROLE_LEVEL = { VIEWER: 1, STUDENT_REP: 2, FACULTY: 3, ADMIN: 4 };

/** Normalises an ACL/DB role string to a known CRAS role (unknown → VIEWER). */
export function normalizeRole(role) {
  const r = typeof role === 'string' ? role.trim().toUpperCase() : '';
  return ROLES.includes(r) ? r : 'VIEWER';
}

export function roleLevel(role) {
  return ROLE_LEVEL[role] || 0;
}

/** Effective permission set = role defaults ∪ explicit ACL grants. */
export function effectivePermissions(role, aclPermissions = []) {
  return new Set([...(ROLE_DEFAULT_PERMISSIONS[normalizeRole(role)] || []), ...aclPermissions]);
}

export function hasPermission(principal, permission) {
  if (!principal) return false;
  const perms = principal.permissions instanceof Set ? principal.permissions : new Set(principal.permissions || []);
  return perms.has(ALL) || perms.has(permission);
}

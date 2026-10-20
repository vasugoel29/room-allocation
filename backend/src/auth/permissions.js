/**
 * CRAS permission catalog — the single list of what can be granted in this app.
 *
 * CRAS defines these names; the college ACL grants them verbatim (`permissions` in the
 * /v1/user-access response). There is no mapping and no built-in default: a person may do exactly
 * what the ACL grants, and a name the catalog doesn't know is ignored. Role is a display label only.
 *
 * Ownership stays in the app: holding cras.bookings lets you manage *your* bookings; holding
 * cras.faculty_portal lets you approve requests that *name you*.
 */

export const PERMISSIONS = Object.freeze({
  CALENDAR: 'cras.calendar',
  TIMETABLE: 'cras.timetable',
  BOOKINGS: 'cras.bookings',
  BOOKINGS_DIRECT: 'cras.bookings.direct',
  FACULTY_PORTAL: 'cras.faculty_portal',
  ADMIN: 'cras.admin',
});

const P = PERMISSIONS;

/** What each permission grants, for the ACL team and GET /api/permissions/catalog. */
export const CATALOG = Object.freeze([
  {
    name: P.CALENDAR,
    title: 'Rooms calendar',
    grants: 'See the rooms calendar: availability and who holds a slot (never the purpose). Read-only on its own.',
  },
  {
    name: P.TIMETABLE,
    title: 'Timetable',
    grants: 'See your own timetable: your section\'s classes, or the classes you teach.',
  },
  {
    name: P.BOOKINGS,
    title: 'Bookings',
    grants: 'The Bookings tab and everything a booker does: request a room (it goes to the named faculty for approval), '
      + 'ask for someone else\'s booking and accept or decline requests for your own, reschedule or cancel your own bookings, '
      + 'and ask a faculty member to cancel a class for a date.',
  },
  {
    name: P.BOOKINGS_DIRECT,
    title: 'Book without approval',
    grants: 'Bookings take effect immediately with no faculty approval, including restricted rooms (committee rooms, auditorium).',
  },
  {
    name: P.FACULTY_PORTAL,
    title: 'Faculty Portal',
    grants: 'Approve or reject booking requests that name you, review class-cancellation requests for your classes, '
      + 'and cancel or restore one of your own classes for a date.',
  },
  {
    name: P.ADMIN,
    title: 'Admin Console',
    grants: 'Everything in the Admin Console: Quick Book for anyone; all bookings with purposes, cancel or move anyone\'s, export; '
      + 'timetable search, editing, import and export; Room Grid; users (view, deactivate, export); rooms (add, edit, '
      + 'deactivate, weekly blocks); faculty directory import and export; analytics and the audit log.',
  },
]);

const KNOWN = new Set(Object.values(P));

/**
 * Suggested bundles to configure in the ACL for each role. CRAS itself never grants from these
 * (a role gives nothing by itself); only the mock ACL used in development and tests reads them.
 */
export const SUGGESTED_BUNDLES = Object.freeze({
  VIEWER: [P.CALENDAR, P.TIMETABLE],
  STUDENT_REP: [P.CALENDAR, P.TIMETABLE, P.BOOKINGS],
  // Faculty book directly and work through their portal (their own bookings are listed there).
  FACULTY: [P.CALENDAR, P.TIMETABLE, P.BOOKINGS_DIRECT, P.FACULTY_PORTAL],
  // The admin approves and cancels anything through cras.admin; no Faculty Portal of their own.
  ADMIN: [P.CALENDAR, P.TIMETABLE, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN],
});

export const ROLES = Object.freeze(['VIEWER', 'STUDENT_REP', 'FACULTY', 'ADMIN']);

/** Normalises an ACL role string for display (unknown → VIEWER). Grants nothing. */
export function normalizeRole(role) {
  const r = typeof role === 'string' ? role.trim().toUpperCase() : '';
  return ROLES.includes(r) ? r : 'VIEWER';
}

/** The permissions a principal holds: exactly the catalog names the ACL granted. */
export function effectivePermissions(aclPermissions = []) {
  return new Set((Array.isArray(aclPermissions) ? aclPermissions : []).filter((p) => KNOWN.has(p)));
}

export function hasPermission(principal, permission) {
  if (!principal) return false;
  const perms = principal.permissions instanceof Set ? principal.permissions : new Set(principal.permissions || []);
  return perms.has(permission);
}

export const hasAnyPermission = (principal, ...permissions) => permissions.some((p) => hasPermission(principal, p));

/** Bookings by this person take effect immediately (no approval) and may use restricted rooms. */
export const canBookDirect = (principal) => hasPermission(principal, P.BOOKINGS_DIRECT);

export const isAdmin = (principal) => hasPermission(principal, P.ADMIN);

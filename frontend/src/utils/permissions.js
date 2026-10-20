// The CRAS permission catalog (backend/src/auth/permissions.js), granted only by the college ACL.
// Role is a display label; everything the UI shows or allows is decided by these names.
export const P = Object.freeze({
  CALENDAR: 'cras.calendar',
  TIMETABLE: 'cras.timetable',
  BOOKINGS: 'cras.bookings',
  BOOKINGS_DIRECT: 'cras.bookings.direct',
  FACULTY_PORTAL: 'cras.faculty_portal',
  ADMIN: 'cras.admin',
});

export const can = (user, permission) => Array.isArray(user?.permissions) && user.permissions.includes(permission);
export const canAny = (user, ...permissions) => permissions.some((p) => can(user, p));

/** May open the calendar / rooms list. */
export const canSeeCalendar = (user) => canAny(user, P.CALENDAR, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN);
/** May make or manage bookings at all. */
export const canBook = (user) => canAny(user, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN);
/** Bookings take effect without approval and may use restricted rooms (what used to be "staff"). */
export const booksDirect = (user) => can(user, P.BOOKINGS_DIRECT);
export const isAdmin = (user) => can(user, P.ADMIN);
/** Identity, not permission: this person is in the faculty directory (has a teaching timetable). */
export const teaches = (user) => user?.faculty_id != null;

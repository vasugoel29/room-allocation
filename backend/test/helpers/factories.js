import jwt from 'jsonwebtoken';
import * as db from '../../src/db.js';
import { SUGGESTED_BUNDLES } from '../../src/auth/permissions.js';
import { invalidatePrincipal } from '../../src/auth/session.js';
import { istDateTimeToUtc, getIstParts } from '../../src/utils/timezone.js';

let seq = 0;
const uid = () => `${process.pid}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A session token for `user`, shaped like the ones sign-in issues (identity only; access comes from the DB). */
export function tokenFor(user, opts = {}) {
  return jwt.sign({ sub: String(user.id), sv: user.session_version || 0, typ: 'session' }, process.env.JWT_SECRET, { expiresIn: '1h', ...opts });
}

/**
 * Inserts a user directly (bypasses signup rules). Defaults to no branch/section so the
 * real seeded timetable never clashes with test bookings unless a test opts in.
 * Returns { user, token, auth } where auth is the Authorization header value.
 */
export async function createUser({ permissions, ...overrides } = {}) {
  const role = overrides.role || 'VIEWER';
  const fields = {
    name: `Test ${role} ${uid()}`,
    email: `t.${role.toLowerCase()}.${uid()}@nsut.ac.in`,
    role,
    ...overrides,
  };
  const cols = Object.keys(fields);
  const { rows } = await db.query(
    `INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    cols.map((c) => fields[c]),
  );
  const user = rows[0];
  // An ACL snapshot like a real sign-in leaves: the suggested bundle for the role, or `permissions`.
  await grantPermissions(user.id, permissions ?? SUGGESTED_BUNDLES[role] ?? [], role);
  const token = tokenFor(user);
  return { user, token, auth: `Bearer ${token}` };
}

/** Replaces a test user's ACL-granted permissions (the principal cache is cleared). */
export async function grantPermissions(userId, permissions, role = null) {
  await db.query(
    `INSERT INTO user_access (user_id, acl_id, role, roles, permissions, fetched_at)
     VALUES ($1, $5, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions, fetched_at = NOW()`,
    [userId, role || 'VIEWER', JSON.stringify(role ? [role] : []), JSON.stringify(permissions), `test_${userId}`],
  );
  invalidatePrincipal(userId);
}

export const createAdmin = (o) => createUser({ ...o, role: 'ADMIN' });
export const createRep = (o) => createUser({ ...o, role: 'STUDENT_REP' });
/** A directory entry (faculties row). Pass `user` to link it to a sign-in account. */
export async function createFacultyEntry({ user = null, name, email, department_name = null, is_active = true } = {}) {
  const { rows } = await db.query(
    `INSERT INTO faculties (name, email, department_name, is_active, user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name || user?.name || `Test Faculty ${uid()}`, (email || user?.email || `t.fac.${uid()}@nsut.ac.in`).toLowerCase(),
      department_name, is_active, user?.id ?? null],
  );
  return rows[0];
}

/**
 * A FACULTY account plus its linked faculty-directory entry.
 * Returns { user, token, auth, faculty } — use `faculty.id` wherever the API expects a faculty id.
 */
export async function createFaculty(o = {}) {
  const created = await createUser({ ...o, role: 'FACULTY' });
  const faculty = await createFacultyEntry({ user: created.user });
  return { ...created, faculty };
}
export const createViewer = (o) => createUser({ ...o, role: 'VIEWER' });

export async function createRoom(overrides = {}) {
  const fields = {
    name: `T-${uid()}`.slice(0, 32),
    building: 'Test Block',
    floor: 1,
    capacity: 60,
    type: 'Lecture Room',
    ...overrides,
  };
  const cols = Object.keys(fields);
  const { rows } = await db.query(
    `INSERT INTO rooms (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    cols.map((c) => fields[c]),
  );
  return rows[0];
}

/** Inserts a booking row directly, skipping business rules. */
export async function insertBooking({ room_id, created_by, start_time, end_time, purpose = 'Seeded', status = 'ACTIVE', faculty_id = null }) {
  end_time = end_time || new Date(new Date(start_time).getTime() + 3600_000).toISOString();
  const { rows } = await db.query(
    `INSERT INTO bookings (room_id, created_by, start_time, end_time, purpose, status, faculty_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [room_id, created_by, start_time, end_time, purpose, status, faculty_id],
  );
  return rows[0];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Next future IST slot on a weekday (Mon–Fri by default) at `hour`, at least `minLeadHours`
 * from now and within the 7-day booking window. Returns { start, end, dateKey, day }.
 *   futureSlot({ hour: 10 })             -> soonest weekday 10:00 IST
 *   futureSlot({ hour: 10, day: 'Wed' }) -> soonest Wednesday 10:00 IST
 *   futureSlot({ hour: 10, weekend: true })
 */
export function futureSlot({ hour = 10, day, weekend = false, minLeadHours = 2, skip = 0 } = {}) {
  const now = Date.now();
  let found = 0;
  for (let i = 0; i < 14; i++) {
    const dateKey = getIstParts(now + i * 86400_000).date;
    const start = istDateTimeToUtc(dateKey, hour);
    const d = getIstParts(start).day;
    const isWeekend = d === 'Sat' || d === 'Sun';
    if (new Date(start).getTime() < now + minLeadHours * 3600_000) continue;
    if (day ? d !== day : isWeekend !== weekend) continue;
    if (found++ < skip) continue;
    return { start, end: new Date(new Date(start).getTime() + 3600_000).toISOString(), dateKey, day: d };
  }
  throw new Error(`No future slot found for ${JSON.stringify({ hour, day, weekend })}`);
}

/** A one-hour slot starting `hoursAgo` (or a bit more) in the past, aligned to the IST hour grid (:30 UTC). */
export function pastSlot(hoursAgo = 3) {
  const IST = 5.5 * 3600_000;
  const t = Date.now() - hoursAgo * 3600_000 + IST;
  const start = new Date(t - (t % 3600_000) - IST);
  return { start: start.toISOString(), end: new Date(start.getTime() + 3600_000).toISOString() };
}

/** An ACTIVE faculty-directory entry to name as `faculty_id` on a student's booking request. */
export const approverId = async () => (await createFacultyEntry()).id;

/** A slot more than a week out (outside the regular booking window). */
export function farFutureSlot(days = 10, hour = 10) {
  const dateKey = getIstParts(Date.now() + days * 86400_000).date;
  const start = istDateTimeToUtc(dateKey, hour);
  return { start, end: new Date(new Date(start).getTime() + 3600_000).toISOString(), dateKey, day: getIstParts(start).day };
}

export { DAYS };

/** Ends the shared pg pool; call from afterAll in every test file. */
export const closeDb = () => db.pool.end();

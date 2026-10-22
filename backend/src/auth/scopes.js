import { hasPermission, PERMISSIONS as P } from './permissions.js';

/**
 * ACL scopes (decision 2026-10-22). The ACL may limit a granted permission with
 * `scopes_by_permission[permission]`: a list of scope objects.
 *  - no entry, or a list containing {}  → unrestricted (every grant today);
 *  - several objects                    → any one may match (OR);
 *  - keys within one object             → all must match (AND); a value may be one value or a list.
 * CRAS defines the keys (the ACL grants them verbatim, like the permission catalog):
 *  - people: department, branch, semester, section — matched to the person's ACL attributes;
 *  - rooms:  building, room (the room's name).
 * A key CRAS doesn't know makes that object match nothing (fail closed). An object without people
 * keys leaves people unrestricted, and one without room keys leaves rooms unrestricted.
 */
export const SCOPE_KEYS = Object.freeze({
  people: Object.freeze(['department', 'branch', 'semester', 'section']),
  rooms: Object.freeze(['building', 'room']),
});
const KNOWN = new Set([...SCOPE_KEYS.people, ...SCOPE_KEYS.rooms]);

/** Published with the permission catalog (GET /api/permissions/catalog) for the ACL team. */
export const SCOPE_CATALOG = Object.freeze({
  format: 'scopes_by_permission: { "<permission>": [ { "<key>": value | [values] }, … ] }. No entry or [{}] = unrestricted; '
    + 'objects are alternatives (any may match); keys in one object must all match; unknown keys match nothing.',
  keys: {
    department: 'Person: their ACL department (dept)',
    branch: 'Person: their ACL branch (as sent, e.g. "INFORMATION TECHNOLOGY")',
    semester: 'Person: their semester',
    section: 'Person: their section',
    building: 'Room: its building, as named in CRAS',
    room: 'Room: its name',
  },
  applies: {
    'cras.calendar': 'rooms you see',
    'cras.bookings': 'rooms you can request, reschedule into or take over by transfer',
    'cras.bookings.direct': 'rooms you can book directly',
    'cras.admin': 'rooms you manage (rooms, weekly blocks, Room Grid, quick book) and people you act on '
      + '(bookings list, cancel, move, approve, export; users; quick book for someone; timetable search, import, slots; analytics). '
      + 'A scoped admin cannot run the whole-campus faculty directory or faculty timetable CSV imports.',
    'cras.timetable': 'not scoped (only ever your own timetable)',
    'cras.faculty_portal': 'not scoped (only requests that name you)',
  },
});

export const OUT_OF_SCOPE = 'That is outside your access scope.';

/** The permissions that show rooms (calendar, booking, admin): their scopes decide which rooms one sees. */
export const ROOM_VIEW_PERMISSIONS = Object.freeze([P.CALENDAR, P.BOOKINGS, P.BOOKINGS_DIRECT, P.ADMIN]);

const norm = (v) => String(v ?? '').trim().toUpperCase();

function normalise(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { never: true };
  const keys = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.trim().toLowerCase();
    if (!KNOWN.has(key)) return { never: true };
    const values = (Array.isArray(v) ? v : [v]).map(norm).filter(Boolean);
    if (!values.length) return { never: true };
    keys[key] = values;
  }
  return { keys };
}

/** One permission's scope list: null when unrestricted, otherwise normalised objects (maybe none). */
function scopeList(principal, permission) {
  const byPermission = principal?.scopes_by_permission || {};
  let list = byPermission[permission];
  if (list === undefined) {
    // A general allowed_scope applies to permissions that carry none of their own.
    const general = principal?.allowed_scope;
    list = general && typeof general === 'object' && Object.keys(general).length ? [general] : null;
  }
  if (list == null) return null;
  const objects = (Array.isArray(list) ? list : [list]).map(normalise);
  if (objects.some((o) => o.keys && !Object.keys(o.keys).length)) return null; // {} = unrestricted
  return objects.filter((o) => !o.never);
}

/**
 * The scopes under which the principal holds any of `permissions` (as route gates are any-of):
 * null when one of them is unrestricted, otherwise the union of their objects.
 */
export function scopesFor(principal, ...permissions) {
  const held = permissions.filter((p) => hasPermission(principal, p));
  let union = [];
  for (const p of held) {
    const list = scopeList(principal, p);
    if (list === null) return null;
    union = union.concat(list);
  }
  return union;
}

const PERSON_FIELDS = { department: 'department_name', branch: 'branch', semester: 'semester', section: 'section' };
const ROOM_FIELDS = { building: 'building', room: 'name' };

const matches = (o, kind, fields, entity) => Object.entries(o.keys)
  .filter(([k]) => SCOPE_KEYS[kind].includes(k))
  .every(([k, values]) => values.includes(norm(entity?.[fields[k]])));

/**
 * May the principal act on this person and/or room under `scopes`? Pass only what the action
 * touches; both must fit the same scope object.
 */
export function allows(scopes, { person, room } = {}) {
  if (scopes === null) return true;
  return scopes.some((o) => (!person || matches(o, 'people', PERSON_FIELDS, person))
    && (!room || matches(o, 'rooms', ROOM_FIELDS, room)));
}

/** Could something with this one attribute (e.g. a branch) be within the scopes? For filtering pick-lists. */
export const mayInclude = (scopes, key, value) => scopes === null
  || scopes.some((o) => !o.keys[key] || o.keys[key].includes(norm(value)));

/** Whether the scopes restrict people / rooms at all (for lists that only show one of the two). */
export const restricts = (scopes, kind) => scopes !== null
  && (scopes.length === 0 || scopes.every((o) => Object.keys(o.keys).some((k) => SCOPE_KEYS[kind].includes(k))));

const PERSON_SQL = { department: (a) => `UPPER(TRIM(${a}.department_name))`, branch: (a) => `UPPER(TRIM(${a}.branch))`,
  semester: (a) => `${a}.semester::text`, section: (a) => `${a}.section::text` };
const ROOM_SQL = { building: (a) => `UPPER(TRIM(${a}.building))`, room: (a) => `UPPER(TRIM(${a}.name))` };

/**
 * SQL condition for lists: `aliases.person` (a users-like row) and/or `aliases.room` (a rooms row).
 * Keys for an entity without an alias are left out, as allows() does. Pushes its values to `params`.
 */
export function scopeSql(scopes, aliases, params) {
  if (scopes === null) return 'TRUE';
  if (!scopes.length) return 'FALSE';
  const ors = scopes.map((o) => {
    const ands = [];
    for (const [k, values] of Object.entries(o.keys)) {
      const expr = SCOPE_KEYS.people.includes(k) ? aliases.person && PERSON_SQL[k](aliases.person) : aliases.room && ROOM_SQL[k](aliases.room);
      if (!expr) continue;
      params.push(values);
      ands.push(`${expr} = ANY($${params.length}::text[])`);
    }
    return ands.length ? `(${ands.join(' AND ')})` : 'TRUE';
  });
  return `(${ors.join(' OR ')})`;
}

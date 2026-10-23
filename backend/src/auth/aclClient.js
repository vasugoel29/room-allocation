import logger from '../utils/logger.js';
import * as db from '../db.js';
import { SUGGESTED_BUNDLES } from './permissions.js';

/**
 * Client for the central Access Control Layer (ACL).
 *
 *   ACL_MODE=live (default)  → POST {ACL_API_URL}/v1/user-access with client credentials from env
 *   ACL_MODE=mock            → in-process directory (test suites only; refused in production)
 *     + ACL_MOCK_SOURCE=db     → directory answered from the local users table (e2e/load stacks,
 *                                where tests seed users in the database of a separate server process)
 *     + ACL_MOCK_SOURCE=personas → fixed developer personas (local development without the live ACL;
 *                                see DEV_PERSONAS)
 *
 * Every error thrown here is an AclError with a `code` the auth layer maps to an HTTP status.
 */

export class AclError extends Error {
  constructor(code, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'AclError';
    this.code = code; // config | not_found | inactive | unavailable | rejected
    this.status = status;
  }
}

const TIMEOUT_MS = Number(process.env.ACL_TIMEOUT_MS || 5000);

/** Shape returned to callers regardless of mode. */
function normalize(data) {
  const user = data?.user || {};
  return {
    aclId: user.id,
    email: (user.email || '').trim().toLowerCase(),
    name: user.name || null,
    type: user.type || null,
    status: user.status || 'ACTIVE',
    academic: user.academic || {},
    role: data?.role || null,
    roles: Array.isArray(data?.roles) ? data.roles : data?.role ? [data.role] : [],
    permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    allowedScope: data?.allowed_scope || {},
    scopesByPermission: data?.scopes_by_permission || {},
  };
}

function checkActive(access) {
  if (!access.aclId) throw new AclError('rejected', 'ACL response did not include a user id.');
  if (access.status !== 'ACTIVE') {
    throw new AclError('inactive', `Your institutional account status is ${access.status}. Access is restricted.`);
  }
  return access;
}

async function liveFetchUserAccess(email) {
  const base = process.env.ACL_API_URL;
  const clientId = process.env.ACL_CLIENT_ID;
  const clientSecret = process.env.ACL_CLIENT_SECRET;
  if (!base || !clientId || !clientSecret) {
    throw new AclError('config', 'Access Control service is not configured (ACL_API_URL / ACL_CLIENT_ID / ACL_CLIENT_SECRET).');
  }

  let res;
  try {
    res = await fetch(`${base.replace(/\/$/, '')}/v1/user-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, email }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.error('ACL request failed', err);
    throw new AclError('unavailable', 'Unable to reach the Access Control service.', { cause: err });
  }

  let body = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON body
  }

  if (res.status === 404) throw new AclError('not_found', 'You are not registered in the institutional access directory.', { status: 404 });
  if (res.status === 401 || res.status === 403) {
    logger.error(`ACL rejected CRAS client credentials (HTTP ${res.status})`, body);
    throw new AclError('config', 'Access Control service rejected this application’s credentials.', { status: res.status });
  }
  if (!res.ok) {
    logger.warn(`ACL returned HTTP ${res.status}`, body);
    throw new AclError('unavailable', `Access Control service error (HTTP ${res.status}).`, { status: res.status });
  }
  return checkActive(normalize(body));
}

// ---- mock directory (tests only) -------------------------------------------------------
const mockDirectory = new Map(); // email -> raw ACL-shaped response | Error
let mockCalls = 0;

export const mockAcl = {
  /** Register a directory entry. `entry` uses the real ACL response shape (user, role, permissions…). */
  set(email, entry) {
    mockDirectory.set(email.trim().toLowerCase(), entry);
  },
  /** Make lookups for `email` fail with an AclError of the given code. */
  fail(email, code = 'unavailable') {
    mockDirectory.set(email.trim().toLowerCase(), new AclError(code, `mock ACL failure: ${code}`));
  },
  delete(email) {
    mockDirectory.delete(email.trim().toLowerCase());
  },
  clear() {
    mockDirectory.clear();
    mockCalls = 0;
  },
  get calls() {
    return mockCalls;
  },
};

/** e2e/load: treat each seeded local user as an ACL directory entry with its stored role. */
async function dbDirectoryEntry(email) {
  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, COALESCE(ua.role, 'VIEWER') AS role, u.branch, u.year, u.semester, u.section, u.group_name
     FROM users u
     LEFT JOIN user_access ua ON ua.user_id = u.id AND ua.revoked_at IS NULL
     WHERE lower(u.email) = $1`,
    [email],
  );
  const u = rows[0];
  if (!u) return null;
  return {
    user: {
      id: `mockdb_${u.id}`,
      name: u.name,
      email: u.email,
      status: 'ACTIVE',
      academic: { branch: u.branch, year: u.year, semester: u.semester, section: u.section, group_no: u.group_name },
    },
    role: u.role,
    roles: [u.role],
    // Simulates an ACL configured with the suggested bundle for this role (dev/e2e/load only).
    permissions: SUGGESTED_BUNDLES[u.role] || [],
  };
}

/**
 * Local development without the live ACL (ACL_MODE=mock, ACL_MOCK_SOURCE=personas, AUTH_DEV_LOGIN=true).
 * One persona per role with the suggested permission bundle. The students are in the demo timetable's
 * section, and the faculty persona is a seeded directory entry who teaches in it (`npm run seed --
 * --demo-timetable`), so every flow has data.
 */
const DEMO_SECTION = { dept: 'Department of Information Technology', branch: 'INFORMATION TECHNOLOGY', year: 3, semester: 5, section: 1, group_no: 1 };
export const DEV_PERSONAS = Object.freeze({
  'dev.admin@nsut.ac.in': { name: 'Dev Admin', role: 'ADMIN', academic: {} },
  'abhinav.tomar@nsut.ac.in': { name: 'Abhinav Tomar', role: 'FACULTY', academic: { dept: 'Department of Computer Science & Engineering' } },
  'dev.rep@nsut.ac.in': { name: 'Dev Class Rep', role: 'STUDENT_REP', academic: DEMO_SECTION },
  'dev.student@nsut.ac.in': { name: 'Dev Student', role: 'VIEWER', academic: DEMO_SECTION },
});

function personaEntry(email) {
  const p = DEV_PERSONAS[email];
  if (!p) return undefined;
  return {
    user: { id: `persona_${email.split('@')[0]}`, name: p.name, email, status: 'ACTIVE', academic: p.academic },
    role: p.role, roles: [p.role], permissions: SUGGESTED_BUNDLES[p.role], allowed_scope: {}, scopes_by_permission: {},
  };
}

async function mockFetchUserAccess(email) {
  mockCalls++;
  const source = process.env.ACL_MOCK_SOURCE;
  const entry = mockDirectory.get(email)
    ?? (source === 'db' ? await dbDirectoryEntry(email) : source === 'personas' ? personaEntry(email) : undefined);
  if (entry instanceof Error) throw entry;
  if (!entry) throw new AclError('not_found', 'You are not registered in the institutional access directory.', { status: 404 });
  return checkActive(normalize(entry));
}

export function aclMode() {
  const mode = (process.env.ACL_MODE || 'live').toLowerCase();
  if (mode === 'mock' && process.env.NODE_ENV === 'production') {
    throw new AclError('config', 'ACL_MODE=mock is not allowed in production.');
  }
  return mode === 'mock' ? 'mock' : 'live';
}

/** Looks a user up in the ACL. Resolves to a normalised access record or throws AclError. */
export async function fetchUserAccess(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized) throw new AclError('rejected', 'Email is required for access verification.');
  return aclMode() === 'mock' ? mockFetchUserAccess(normalized) : liveFetchUserAccess(normalized);
}

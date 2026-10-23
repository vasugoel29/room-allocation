import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import * as db from '../db.js';
import logger from '../utils/logger.js';
import { AclError, fetchUserAccess } from './aclClient.js';
import { effectivePermissions, normalizeRole } from './permissions.js';

/**
 * Sessions and principals.
 *
 * The browser holds a short-lived session JWT that carries only the user id (`sub`) and a
 * session version (`sv`). Everything that decides access — role, permissions, scopes, academic
 * profile — is loaded server-side on each request from `users` + `user_access`, and the ACL
 * snapshot is refreshed when it is older than ACL_REFRESH_SECONDS, so role changes and
 * revocations in the ACL apply within minutes. Logging out bumps `users.session_version`,
 * invalidating every token issued before.
 */

/** The signing secret (server.js refuses to start in production without JWT_SECRET). */
export const jwtSecret = () => process.env.JWT_SECRET || 'dev_secret_fallback_only_for_non_production';
const JWT_SECRET = jwtSecret;
const SESSION_TTL = () => process.env.SESSION_TTL || '12h';
const REFRESH_MS = () => Number(process.env.ACL_REFRESH_SECONDS || 900) * 1000;
const MAX_STALE_MS = () => Number(process.env.ACL_MAX_STALE_SECONDS || 12 * 3600) * 1000;
const CACHE_MS = () => Number(process.env.PRINCIPAL_CACHE_MS ?? 30_000);

export class SessionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function issueSessionToken(user) {
  return jwt.sign({ sub: String(user.id), sv: user.session_version || 0, typ: 'session' }, JWT_SECRET(), {
    expiresIn: SESSION_TTL(),
  });
}

export function getAuthCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 12 * 60 * 60 * 1000, // 12 hours
    path: '/',
  };
}

export function getPermissionsCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  };
}

export function attachAuthCookies(res, user, principal) {
  if (!res || typeof res.cookie !== 'function') return null;
  const token = issueSessionToken(user);
  res.cookie('token', token, getAuthCookieOptions());
  const perms = principal?.permissions ? [...principal.permissions] : [];
  res.cookie('permissions', JSON.stringify(perms), getPermissionsCookieOptions());
  return token;
}

export function clearAuthCookies(res) {
  if (!res || typeof res.clearCookie !== 'function') return;
  res.clearCookie('token', getAuthCookieOptions());
  res.clearCookie('permissions', getPermissionsCookieOptions());
}


// jsonwebtoken, given a string secret, first tries to parse it as a PEM public key on every
// verify (a thrown-and-caught createPublicKey) — a quarter of all server CPU at peak (PERF-06).
// A ready-made HMAC KeyObject skips that.
let hmacKey = { secret: null, key: null };
const verifyKey = () => {
  const secret = JWT_SECRET();
  if (hmacKey.secret !== secret) hmacKey = { secret, key: crypto.createSecretKey(Buffer.from(secret, 'utf8')) };
  return hmacKey.key;
};

// A token is verified once (the limiter, authenticate and the audit log all ask) and the result
// is reused until the token expires. Tokens are immutable, and revocation is still enforced on
// every request by the session-version check in loadPrincipal.
const verified = new Map(); // token -> { secret, userId, sv, expMs }
const MAX_VERIFIED = 20_000;

/** Verifies a session token (as issued by issueSessionToken); returns { userId, sv }. */
export function verifySessionToken(token) {
  const secret = JWT_SECRET();
  const hit = verified.get(token);
  if (hit && hit.secret === secret && hit.expMs > Date.now()) return { userId: hit.userId, sv: hit.sv };
  const decoded = jwt.verify(token, verifyKey());
  if (decoded.typ !== 'session') throw new Error('not a session token');
  const userId = Number(decoded.sub);
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('token has no subject');
  const sv = Number(decoded.sv || 0);
  if (decoded.exp) {
    if (verified.size >= MAX_VERIFIED) verified.delete(verified.keys().next().value);
    verified.set(token, { secret, userId, sv, expMs: decoded.exp * 1000 });
  }
  return { userId, sv };
}

// ---- principal cache -------------------------------------------------------------------
const cache = new Map(); // userId -> { principal, sv, at }

export function invalidatePrincipal(userId) {
  cache.delete(Number(userId));
}
export function clearPrincipalCache() {
  cache.clear();
}

const intIn = (v, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Creates/updates the local identity row and ACL snapshot from an ACL access record.
 * Matches by acl_id first, then by email (links pre-existing local accounts).
 */
export async function upsertUserFromAcl(access) {
  const a = access.academic || {};
  const role = normalizeRole(access.role);
  const profile = {
    name: access.name || 'NSUT User',
    email: access.email,
    role,
    branch: a.branch || null,
    department_name: a.dept || null,
    degree: a.degree || null,
    roll_no: a.roll_no || null,
    year: intIn(a.year, 1, 5),
    semester: intIn(a.semester, 1, 8),
    section: intIn(a.section, 1, 15),
    group_name: intIn(a.group_no ?? a.group, 0, 1000),
  };

  return db.runInTransaction(async (client) => {
    const existing = await client.query(
      'SELECT id, is_active FROM users WHERE acl_id = $1 OR lower(email) = $2 ORDER BY (acl_id = $1) DESC NULLS LAST LIMIT 1',
      [access.aclId, access.email],
    );
    if (existing.rows[0] && !existing.rows[0].is_active) {
      throw new SessionError(403, 'Your CRAS account has been deactivated. Contact the administrator.');
    }
    let user;
    if (existing.rows[0]) {
      ({ rows: [user] } = await client.query(
        `UPDATE users SET acl_id = $1, name = $2, email = $3, branch = $4, department_name = $5,
                degree = $6, roll_no = $7, year = $8, semester = $9, section = $10, group_name = $11,
                updated_at = NOW()
          WHERE id = $12 RETURNING *`,
        [access.aclId, profile.name, profile.email, profile.branch, profile.department_name, profile.degree,
          profile.roll_no, profile.year, profile.semester, profile.section, profile.group_name, existing.rows[0].id],
      ));
    } else {
      ({ rows: [user] } = await client.query(
        `INSERT INTO users (acl_id, name, email, branch, department_name, degree, roll_no, year, semester, section, group_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [access.aclId, profile.name, profile.email, profile.branch, profile.department_name, profile.degree,
          profile.roll_no, profile.year, profile.semester, profile.section, profile.group_name],
      ));
    }

    // Link the faculty directory entry with this email to the signed-in account.
    await client.query(
      `UPDATE faculties SET user_id = $1, updated_at = NOW()
        WHERE lower(email) = lower($2) AND is_active AND (user_id IS NULL OR user_id = $1)`,
      [user.id, user.email],
    );

    await client.query(
      `INSERT INTO user_access (user_id, acl_id, role, roles, permissions, allowed_scope, scopes_by_permission, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET acl_id = EXCLUDED.acl_id, role = EXCLUDED.role, roles = EXCLUDED.roles,
         permissions = EXCLUDED.permissions, allowed_scope = EXCLUDED.allowed_scope,
         scopes_by_permission = EXCLUDED.scopes_by_permission, fetched_at = NOW(), revoked_at = NULL`,
      [user.id, access.aclId, role, JSON.stringify(access.roles), JSON.stringify(access.permissions),
        JSON.stringify(access.allowedScope), JSON.stringify(access.scopesByPermission)],
    );
    invalidatePrincipal(user.id);
    return user;
  });
}

async function readRow(userId) {
  const { rows } = await db.query(
    `SELECT u.*, fac.id AS faculty_directory_id,
            ua.role AS acl_role, ua.roles AS acl_roles, ua.permissions AS acl_permissions,
            ua.allowed_scope, ua.scopes_by_permission, ua.fetched_at AS acl_fetched_at
       FROM users u
       LEFT JOIN user_access ua ON ua.user_id = u.id AND ua.revoked_at IS NULL
       LEFT JOIN faculties fac ON fac.user_id = u.id AND fac.is_active
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] || null;
}

function toPrincipal(row) {
  const role = normalizeRole(row.acl_role || 'VIEWER');
  return {
    id: row.id,
    acl_id: row.acl_id || null,
    email: row.email,
    name: row.name,
    role,
    roles: row.acl_roles || [role],
    // Exactly what the ACL granted (catalog names only); no role-based defaults.
    permissions: effectivePermissions(row.acl_permissions || []),
    allowed_scope: row.allowed_scope || {},
    scopes_by_permission: row.scopes_by_permission || {},
    branch: row.branch,
    year: row.year,
    semester: row.semester,
    section: row.section,
    group_name: row.group_name,
    degree: row.degree,
    roll_no: row.roll_no,
    department_name: row.department_name || null,
    // This person's entry in the faculty directory (faculties.id), or null. Faculty references on
    // bookings, transfers and cancellation requests are directory ids, never user ids.
    faculty_id: row.faculty_directory_id || null,
    session_version: row.session_version || 0,
  };
}

/** Refreshes a stale ACL snapshot; returns the fresh row, or null if the ACL revoked the user. */
async function refreshFromAcl(row) {
  try {
    const access = await fetchUserAccess(row.email);
    await upsertUserFromAcl(access);
    return readRow(row.id);
  } catch (err) {
    if (err instanceof AclError && (err.code === 'not_found' || err.code === 'inactive')) {
      logger.warn(`ACL revoked access for user ${row.id}: ${err.code}`);
      // The snapshot is kept as a record, marked revoked: it no longer grants anything.
      await db.query('UPDATE user_access SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [row.id]);
      return null;
    }
    const age = Date.now() - new Date(row.acl_fetched_at).getTime();
    if (age < MAX_STALE_MS()) {
      logger.warn(`ACL refresh failed for user ${row.id}; using snapshot from ${Math.round(age / 1000)}s ago`, err);
      return row;
    }
    throw new SessionError(503, 'Unable to verify your access right now. Please try again shortly.');
  }
}

/**
 * Loads the principal and validates status/permissions with the central ACL.
 * If forceRefresh is true or ACL_CONFIRM_ON_API_CALL is not false, it re-queries the ACL.
 * Returns { principal, user, permissionsChanged }.
 */
export async function loadPrincipalWithAcl(userId, sv = 0, { forceRefresh = false } = {}) {
  const confirmAlways = process.env.ACL_CONFIRM_ON_API_CALL !== 'false';
  const shouldCheckAcl = forceRefresh || confirmAlways;

  if (!shouldCheckAcl) {
    const hit = cache.get(userId);
    if (hit && hit.sv === sv && Date.now() - hit.at < CACHE_MS()) {
      return { principal: hit.principal, user: hit.user || null, permissionsChanged: false };
    }
  }

  let row = await readRow(userId);
  if (!row || !row.is_active || (row.session_version || 0) !== sv) {
    cache.delete(userId);
    return { principal: null, user: null, permissionsChanged: false };
  }

  let permissionsChanged = false;
  if (row.acl_id) {
    if (!row.acl_fetched_at) {
      cache.delete(userId);
      return { principal: null, user: null, permissionsChanged: false };
    }
    const isStale = Date.now() - new Date(row.acl_fetched_at).getTime() > REFRESH_MS();
    if (shouldCheckAcl || isStale) {
      const oldPerms = new Set(row.acl_permissions || []);
      const oldRole = row.acl_role;

      const freshRow = await refreshFromAcl(row);
      if (!freshRow) {
        cache.delete(userId);
        return { principal: null, user: null, permissionsChanged: true };
      }

      const newPerms = new Set(freshRow.acl_permissions || []);
      const newRole = freshRow.acl_role;
      permissionsChanged = oldRole !== newRole || oldPerms.size !== newPerms.size || [...oldPerms].some((p) => !newPerms.has(p));
      row = freshRow;
    }
  }

  const principal = toPrincipal(row);
  cache.set(userId, { principal, user: row, sv, at: Date.now() });
  return { principal, user: row, permissionsChanged };
}

/**
 * Resolves the principal for a verified session. Returns null when the user no longer exists,
 * the session was revoked, or the ACL withdrew access.
 */
export async function loadPrincipal(userId, sv = 0, options = {}) {
  const { principal } = await loadPrincipalWithAcl(userId, sv, options);
  return principal;
}

/** Revokes every session of a user (logout everywhere). */
export async function revokeSessions(userId) {
  await db.query('UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = $1', [userId]);
  invalidatePrincipal(userId);
}

/** Public, browser-safe view of a principal. */
export function publicProfile(p) {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: p.role,
    roles: p.roles,
    permissions: [...p.permissions],
    branch: p.branch,
    year: p.year,
    semester: p.semester,
    section: p.section,
    group_name: p.group_name,
    degree: p.degree,
    department_name: p.department_name,
    faculty_id: p.faculty_id,
  };
}

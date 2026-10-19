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

const JWT_SECRET = () => process.env.JWT_SECRET || 'dev_secret_fallback_only_for_non_production';
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

/** Verifies a session token; returns { userId, sv }. Accepts legacy `{ id }` tokens (sv 0). */
export function verifySessionToken(token) {
  const secret = JWT_SECRET();
  const hit = verified.get(token);
  if (hit && hit.secret === secret && hit.expMs > Date.now()) return { userId: hit.userId, sv: hit.sv };
  const decoded = jwt.verify(token, verifyKey());
  const userId = Number(decoded.sub ?? decoded.id);
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
        `UPDATE users SET acl_id = $1, name = $2, email = $3, role = $4, branch = $5, department_name = $6,
                degree = $7, roll_no = $8, year = $9, semester = $10, section = $11, group_name = $12,
                is_approved = true, updated_at = NOW()
          WHERE id = $13 RETURNING *`,
        [access.aclId, profile.name, profile.email, role, profile.branch, profile.department_name, profile.degree,
          profile.roll_no, profile.year, profile.semester, profile.section, profile.group_name, existing.rows[0].id],
      ));
    } else {
      ({ rows: [user] } = await client.query(
        `INSERT INTO users (acl_id, name, email, password, role, branch, department_name, degree, roll_no, year, semester, section, group_name, is_approved)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8, $9, $10, $11, $12, true) RETURNING *`,
        [access.aclId, profile.name, profile.email, role, profile.branch, profile.department_name, profile.degree,
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
      `INSERT INTO user_access (user_id, acl_id, role, roles, permissions, allowed_scope, scopes_by_permission, academic, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id) DO UPDATE SET acl_id = EXCLUDED.acl_id, role = EXCLUDED.role, roles = EXCLUDED.roles,
         permissions = EXCLUDED.permissions, allowed_scope = EXCLUDED.allowed_scope,
         scopes_by_permission = EXCLUDED.scopes_by_permission, academic = EXCLUDED.academic, fetched_at = NOW()`,
      [user.id, access.aclId, role, JSON.stringify(access.roles), JSON.stringify(access.permissions),
        JSON.stringify(access.allowedScope), JSON.stringify(access.scopesByPermission), JSON.stringify(a)],
    );
    invalidatePrincipal(user.id);
    return user;
  });
}

async function readRow(userId) {
  const { rows } = await db.query(
    `SELECT u.*, d.name AS department_label, fac.id AS faculty_directory_id,
            ua.role AS acl_role, ua.roles AS acl_roles, ua.permissions AS acl_permissions,
            ua.allowed_scope, ua.scopes_by_permission, ua.fetched_at AS acl_fetched_at
       FROM users u
       LEFT JOIN user_access ua ON ua.user_id = u.id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN faculties fac ON fac.user_id = u.id AND fac.is_active
      WHERE u.id = $1`,
    [userId],
  );
  return rows[0] || null;
}

function toPrincipal(row) {
  const role = normalizeRole(row.acl_role || row.role);
  return {
    id: row.id,
    acl_id: row.acl_id || null,
    email: row.email,
    name: row.name,
    role,
    roles: row.acl_roles || [role],
    permissions: effectivePermissions(role, row.acl_permissions || []),
    allowed_scope: row.allowed_scope || {},
    scopes_by_permission: row.scopes_by_permission || {},
    branch: row.branch,
    branch_id: row.branch_id,
    year: row.year,
    semester: row.semester,
    section: row.section,
    group_name: row.group_name,
    degree: row.degree,
    roll_no: row.roll_no,
    department_id: row.department_id,
    department_name: row.department_name || row.department_label || null,
    is_approved: row.is_approved,
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
      await db.query('DELETE FROM user_access WHERE user_id = $1', [row.id]);
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
 * Resolves the principal for a verified session. Returns null when the user no longer exists,
 * the session was revoked, or the ACL withdrew access.
 */
export async function loadPrincipal(userId, sv = 0) {
  const hit = cache.get(userId);
  if (hit && hit.sv === sv && Date.now() - hit.at < CACHE_MS()) return hit.principal;

  let row = await readRow(userId);
  if (!row || !row.is_active || (row.session_version || 0) !== sv) {
    cache.delete(userId);
    return null;
  }
  if (row.acl_id) {
    // ACL-backed account: no snapshot means access was revoked; a stale one gets refreshed.
    if (!row.acl_fetched_at) return null;
    if (Date.now() - new Date(row.acl_fetched_at).getTime() > REFRESH_MS()) {
      row = await refreshFromAcl(row);
      if (!row) {
        cache.delete(userId);
        return null;
      }
    }
  }
  const principal = toPrincipal(row);
  cache.set(userId, { principal, sv, at: Date.now() });
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
    branch_id: p.branch_id,
    year: p.year,
    semester: p.semester,
    section: p.section,
    group_name: p.group_name,
    degree: p.degree,
    department_id: p.department_id,
    department_name: p.department_name,
    faculty_id: p.faculty_id,
  };
}

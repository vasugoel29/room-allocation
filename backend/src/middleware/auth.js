import { loadPrincipal, verifySessionToken, SessionError } from '../auth/session.js';
import { hasAnyPermission } from '../auth/permissions.js';

if (!process.env.JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is not set!');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}
export const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_fallback_only_for_non_production';
// Note: In production, the app will exit if JWT_SECRET is missing.
// For development, we keep a fallback to avoid blocking the team, but warn loudly.

/**
 * Verifies the session token and loads the principal (role, permissions, profile) from the
 * database on every request — never from token claims — so revocations and role changes apply
 * immediately. Sets req.user.
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  let session;
  try {
    session = verifySessionToken(authHeader.slice(7));
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const principal = await loadPrincipal(session.userId, session.sv);
    if (!principal) return res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
    req.user = principal;
    next();
  } catch (err) {
    if (err instanceof SessionError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/**
 * Permission gate. Passes when the principal holds any one of `permissions` (catalog names in
 * src/auth/permissions.js, granted only by the college ACL).
 */
export function requirePermission(...permissions) {
  if (!permissions.length || permissions.some((p) => !p)) throw new Error('requirePermission: permission is required');
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!hasAnyPermission(req.user, ...permissions)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

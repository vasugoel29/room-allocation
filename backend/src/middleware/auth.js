import {
  attachAuthCookies,
  clearAuthCookies,
  loadPrincipalWithAcl,
  verifySessionToken,
  SessionError,
} from '../auth/session.js';
import { hasAnyPermission } from '../auth/permissions.js';

if (!process.env.JWT_SECRET) console.error('CRITICAL: JWT_SECRET is not set (server.js refuses to start in production without it).');

/**
 * Verifies the session token (from Authorization header or cookie) and validates
 * permissions with the central ACL on every request.
 */
export async function authenticate(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  let session;
  try {
    session = verifySessionToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const { principal, user, permissionsChanged } = await loadPrincipalWithAcl(session.userId, session.sv);
    if (!principal) {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
    }
    req.user = principal;

    // Refresh cookies if permissions changed in ACL, or if client does not have permissions cookie
    if (permissionsChanged || !req.cookies?.permissions) {
      attachAuthCookies(res, user, principal);
    }

    next();
  } catch (err) {
    if (err instanceof SessionError) return res.status(err.status).json({ error: err.message });
    next(err);
  }
}

/**
 * Permission gate. Passes when the principal holds any one of `permissions` (catalog names in
 * src/auth/permissions.js, granted only by the college ACL).
 * If unauthorized, immediately confirms with the ACL to check for updated permissions, refreshes the cookie,
 * and proceeds if access has been granted.
 */
export function requirePermission(...permissions) {
  if (!permissions.length || permissions.some((p) => !p)) throw new Error('requirePermission: permission is required');
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (!hasAnyPermission(req.user, ...permissions)) {
      // User is currently unauthorized for this action.
      // Confirm with ACL to see if permissions have been updated / granted.
      try {
        const { principal, user } = await loadPrincipalWithAcl(req.user.id, req.user.session_version || 0, { forceRefresh: true });
        if (!principal) {
          clearAuthCookies(res);
          return res.status(401).json({ error: 'Session is no longer valid. Please sign in again.' });
        }
        req.user = principal;

        // Refresh cookie with updated permissions
        attachAuthCookies(res, user, principal);

        // Check if the freshly updated permissions now grant access
        if (hasAnyPermission(req.user, ...permissions)) {
          return next();
        }
      } catch (err) {
        if (err instanceof SessionError) return res.status(err.status).json({ error: err.message });
        return next(err);
      }

      // Still unauthorized after re-checking with ACL
      return res.status(403).json({
        error: 'Forbidden',
        permissions: [...req.user.permissions],
      });
    }

    next();
  };
}

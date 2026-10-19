import logger from '../utils/logger.js';
import { AclError, fetchUserAccess } from '../auth/aclClient.js';
import { GoogleAuthError, verifyGoogleIdToken } from '../auth/google.js';
import {
  issueSessionToken,
  loadPrincipal,
  publicProfile,
  revokeSessions,
  SessionError,
  upsertUserFromAcl,
  verifySessionToken,
} from '../auth/session.js';

const ACL_STATUS = { not_found: 403, inactive: 403, config: 503, unavailable: 503, rejected: 403 };
const GOOGLE_STATUS = { missing: 400, not_configured: 503, invalid_token: 401, unverified_email: 403, wrong_domain: 403 };

/** ACL lookup → local identity upsert → session token. Shared by Google and dev login. */
async function startSession(email, res) {
  const access = await fetchUserAccess(email);
  const user = await upsertUserFromAcl(access);
  const principal = await loadPrincipal(user.id, user.session_version || 0);
  return res.json({ message: 'Signed in', token: issueSessionToken(user), user: publicProfile(principal) });
}

function sendAuthError(res, err, context) {
  if (err instanceof GoogleAuthError) return res.status(GOOGLE_STATUS[err.code] || 401).json({ error: err.message });
  if (err instanceof AclError) return res.status(ACL_STATUS[err.code] || 503).json({ error: err.message });
  if (err instanceof SessionError) return res.status(err.status).json({ error: err.message });
  logger.error(`${context} failed`, err);
  return res.status(500).json({ error: 'Sign-in failed. Please try again.' });
}

/** POST /api/auth/google { credential } — the Google Identity Services ID token. */
export const googleLogin = async (req, res) => {
  try {
    const { email } = await verifyGoogleIdToken(req.body?.credential);
    return await startSession(email, res);
  } catch (err) {
    return sendAuthError(res, err, 'Google login');
  }
};

export const devLoginEnabled = () =>
  process.env.AUTH_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

/**
 * POST /api/auth/dev-login { email } — development only (AUTH_DEV_LOGIN=true, never in
 * production). Skips Google but still goes through the ACL, so roles are real.
 */
export const devLogin = async (req, res) => {
  if (!devLoginEnabled()) return res.status(404).json({ error: 'Not found' });
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ error: 'email is required' });
  try {
    return await startSession(email, res);
  } catch (err) {
    return sendAuthError(res, err, 'Dev login');
  }
};

/** GET /api/auth/me — the caller's current principal (fresh role/permissions). */
export const me = (req, res) => res.json({ user: publicProfile(req.user) });

/** POST /api/auth/logout — revokes all of the caller's sessions when a valid token is sent. */
export const logout = async (req, res) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const { userId } = verifySessionToken(header.slice(7));
      await revokeSessions(userId);
    } catch {
      // invalid/expired token: nothing to revoke
    }
  }
  res.json({ message: 'Logged out successfully' });
};

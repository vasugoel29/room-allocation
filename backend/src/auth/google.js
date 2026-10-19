import { OAuth2Client } from 'google-auth-library';

/**
 * Verifies a Google Identity Services ID token (the `credential` the GIS button returns).
 * Checks signature, audience (GOOGLE_CLIENT_ID), issuer, expiry, verified email and the
 * Workspace hosted domain (GOOGLE_ALLOWED_HD, default nsut.ac.in).
 */

export class GoogleAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code; // missing | not_configured | invalid_token | wrong_domain | unverified_email
  }
}

let client = null;
const getClient = () => (client ||= new OAuth2Client());

const defaultVerifier = async (idToken) => {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new GoogleAuthError('not_configured', 'Google sign-in is not configured on the server.');
  try {
    const ticket = await getClient().verifyIdToken({ idToken, audience: audience.split(',').map((s) => s.trim()) });
    return ticket.getPayload();
  } catch (err) {
    throw new GoogleAuthError('invalid_token', `Google sign-in token could not be verified: ${err.message}`);
  }
};

let verifier = defaultVerifier;

/** Test hook: replace the signature verifier (returns the token payload). Pass null to restore. */
export function setGoogleVerifier(fn) {
  verifier = fn || defaultVerifier;
}

export async function verifyGoogleIdToken(idToken) {
  if (typeof idToken !== 'string' || !idToken) {
    throw new GoogleAuthError('missing', 'A Google sign-in credential is required.');
  }
  const payload = await verifier(idToken);
  const allowedHd = (process.env.GOOGLE_ALLOWED_HD || 'nsut.ac.in').toLowerCase();
  const email = (payload?.email || '').toLowerCase();

  if (!payload?.email_verified) throw new GoogleAuthError('unverified_email', 'Your Google account email is not verified.');
  if ((payload.hd || '').toLowerCase() !== allowedHd || !email.endsWith(`@${allowedHd}`)) {
    throw new GoogleAuthError('wrong_domain', `Only institutional @${allowedHd} Google accounts are permitted.`);
  }
  return { email, name: payload.name || null, sub: payload.sub };
}

import logger from '../utils/logger.js';

const ACL_API_URL = process.env.ACL_API_URL || 'https://acl-lake.vercel.app';
const ACL_CLIENT_ID = process.env.ACL_CLIENT_ID || 'CRAS';
const ACL_CLIENT_SECRET = process.env.ACL_CLIENT_SECRET || 'cras_sec_S-RO6JLXtZhiUbS-AAoO7VQ4GdYB2Tvg';

/**
 * Fetches user access details from the central Access Control Layer (ACL).
 * @param {string} email - The user's NSUT email address
 * @returns {Promise<Object>} The verified ACL user and access payload
 */
export async function fetchUserAccess(email) {
  if (!email) {
    throw new Error('Email is required for ACL access verification');
  }

  const endpoint = `${ACL_API_URL}/v1/user-access`;
  logger.info(`Requesting ACL access verification for email: ${email}`);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: ACL_CLIENT_ID,
        client_secret: ACL_CLIENT_SECRET,
        email: email.trim().toLowerCase()
      })
    });
  } catch (err) {
    logger.error('Failed to communicate with ACL directory service', err);
    throw new Error('Unable to connect to Access Control directory service.');
  }

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch {
      // response not JSON
    }

    if (response.status === 404) {
      throw new Error(errorData.error_description || 'User is not registered in the institutional ACL directory.');
    }

    logger.warn(`ACL returned HTTP ${response.status}`, errorData);
    throw new Error(errorData.error_description || errorData.error || `ACL verification failed (HTTP ${response.status})`);
  }

  const aclData = await response.json();

  if (aclData.user?.status && aclData.user.status !== 'ACTIVE') {
    throw new Error(`Your institutional account status is ${aclData.user.status}. Access is restricted.`);
  }

  return aclData;
}

export default {
  fetchUserAccess
};

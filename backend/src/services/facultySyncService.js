import logger from '../utils/logger.js';
import { pool } from '../db.js';

const ACL_API_URL = process.env.ACL_API_URL;
const ACL_CLIENT_ID = process.env.ACL_CLIENT_ID;
const ACL_CLIENT_SECRET = process.env.ACL_CLIENT_SECRET;
const ACL_FACULTIES_ENDPOINT = process.env.ACL_FACULTIES_ENDPOINT || (ACL_API_URL ? `${ACL_API_URL}/v1/app-users?role=FACULTY` : null);

/**
 * Synchronizes the local faculties catalog with the central Access Control Layer (ACL).
 * Queries ACL for users mapped to the role 'FACULTY' in CRAS and updates the faculties table.
 */
export async function syncFacultiesFromAcl() {
  if (!ACL_FACULTIES_ENDPOINT || !ACL_CLIENT_ID || !ACL_CLIENT_SECRET) {
    return { success: false, reason: 'not_configured' };
  }
  logger.info(`[FacultySync] Initiating faculty catalog synchronization from ACL...`);

  try {
    const response = await fetch(ACL_FACULTIES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: ACL_CLIENT_ID,
        client_secret: ACL_CLIENT_SECRET,
        role: 'FACULTY'
      })
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.info(`[FacultySync] Central ACL faculty listing endpoint is not yet deployed (${ACL_FACULTIES_ENDPOINT}). Using local cached catalog.`);
        return { success: false, reason: 'endpoint_pending' };
      }
      logger.warn(`[FacultySync] ACL returned HTTP ${response.status} during faculty sync.`);
      return { success: false, reason: `http_${response.status}` };
    }

    const data = await response.json();
    const facultyList = Array.isArray(data) ? data : data.users || data.faculties || [];

    if (!facultyList.length) {
      logger.info(`[FacultySync] ACL returned 0 faculty records.`);
      return { success: true, count: 0 };
    }

    let syncedCount = 0;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const f of facultyList) {
        const email = (f.email || '').toLowerCase().trim();
        const name = (f.name || '').trim();
        const dept = f.academic?.dept || f.department || f.department_name || null;

        if (!email || !name) continue;

        await client.query(
          `INSERT INTO faculties (name, email, department_name, is_active, updated_at)
           VALUES ($1, $2, $3, true, NOW())
           ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               department_name = COALESCE(EXCLUDED.department_name, faculties.department_name),
               is_active = true,
               updated_at = NOW()`,
          [name, email, dept]
        );
        syncedCount++;
      }
      await client.query('COMMIT');
      logger.info(`[FacultySync] Successfully synchronized ${syncedCount} faculties from central ACL.`);
      return { success: true, count: syncedCount };
    } catch (dbErr) {
      await client.query('ROLLBACK');
      logger.error(`[FacultySync] Database error during faculty sync`, dbErr);
      throw dbErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn(`[FacultySync] Faculty sync skipped or pending endpoint: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Initializes the daily cron job for faculty catalog sync.
 * Runs once after server boot, and every 24 hours thereafter.
 */
export function initFacultySyncCron() {
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  // Run initial sync check 10 seconds after boot
  setTimeout(() => {
    syncFacultiesFromAcl().catch(err => {
      logger.warn(`[FacultySync] Initial startup sync check: ${err.message}`);
    });
  }, 10000);

  // Set recurring 24h cron
  const timer = setInterval(() => {
    syncFacultiesFromAcl().catch(err => {
      logger.warn(`[FacultySync] Daily sync check: ${err.message}`);
    });
  }, TWENTY_FOUR_HOURS);

  // Prevent blocking process exit during tests
  if (timer.unref) {
    timer.unref();
  }

  logger.info(`[FacultySync] Daily faculty synchronization scheduler initialized.`);
}

export default {
  syncFacultiesFromAcl,
  initFacultySyncCron
};

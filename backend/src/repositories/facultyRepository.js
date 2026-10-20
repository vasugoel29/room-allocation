import * as db from '../db.js';
import { clearPrincipalCache } from '../auth/session.js';

/**
 * The faculty directory (faculties table): CRAS-owned data, added to and soft-deleted by admin
 * imports and, in future, the ACL cron. `faculties.id` is what bookings.faculty_id,
 * booking_transfers.target_faculty_id and class_cancellation_requests.faculty_id reference;
 * `user_id` links an entry to the sign-in account of that faculty member once they log in.
 */
export const facultyRepository = {
  findById: async (id, client = db) => {
    const { rows } = await client.query('SELECT * FROM faculties WHERE id = $1', [id]);
    return rows[0] || null;
  },

  /** An entry that can be chosen for new activity. */
  findActiveById: async (id, client = db) => {
    const { rows } = await client.query('SELECT * FROM faculties WHERE id = $1 AND is_active', [id]);
    return rows[0] || null;
  },

  findActiveByName: async (name, client = db) => {
    const { rows } = await client.query(
      'SELECT * FROM faculties WHERE is_active AND UPPER(TRIM(name)) = UPPER(TRIM($1)) ORDER BY id LIMIT 1',
      [name],
    );
    return rows[0] || null;
  },

  searchActiveNames: async (pattern, limit = 10, client = db) => {
    const { rows } = await client.query(
      'SELECT name FROM faculties WHERE is_active AND name ILIKE $1 ORDER BY name LIMIT $2',
      [pattern, limit],
    );
    return rows.map((r) => r.name);
  },

  /** Insert or update an entry by email; reactivates a soft-deleted one. Department is a label. */
  upsert: async ({ name, email, department_name = null }, client = db) => {
    const { rows } = await client.query(
      `INSERT INTO faculties (name, email, department_name, is_active, deactivated_at, updated_at)
       VALUES ($1, lower($2), $3, TRUE, NULL, NOW())
       ON CONFLICT (lower(email)) DO UPDATE
         SET name = EXCLUDED.name,
             department_name = COALESCE(EXCLUDED.department_name, faculties.department_name),
             is_active = TRUE, deactivated_at = NULL, updated_at = NOW()
       RETURNING *, (xmax = 0) AS inserted`,
      [name, email, department_name],
    );
    return rows[0];
  },


  /** Soft delete. History keeps pointing at the entry. */
  deactivate: async (id, client = db) => {
    const { rows } = await client.query(
      'UPDATE faculties SET is_active = FALSE, deactivated_at = NOW(), updated_at = NOW() WHERE id = $1 AND is_active RETURNING *',
      [id],
    );
    if (rows[0]) clearPrincipalCache(); // principals carry faculty_id; don't let a cached one outlive the entry
    return rows[0] || null;
  },
};

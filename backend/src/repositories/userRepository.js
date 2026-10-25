import * as db from '../db.js';
import { timetableRepository } from './timetableRepository.js';
import { scopeSql } from '../auth/scopes.js';
import { notify, bookingFacts } from '../notifications/notify.js';
import { restoreClassesForBookings } from '../services/classDisplacement.js';

/**
 * Repository for User-related database operations
 */
export const userRepository = {
  /**
   * Find a user by ID (department and branch are ACL attributes on the row)
   */
  findById: async (id, client = db) => {
    const query = `
      SELECT u.*
      FROM users u
      WHERE u.id = $1
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Find a user by email
   */
  findByEmail: async (email, client = db) => {
    const query = `
      SELECT u.*
      FROM users u
      WHERE u.email = $1 AND u.is_active
    `;
    const result = await client.query(query, [email]);
    return result.rows[0];
  },

  findAll: async (limit, offset, search = '', role = '', scopes = null) => {
    const params = [];
    let query = `
      SELECT u.id, u.name, u.email, COALESCE(ua.role, 'VIEWER') AS role, u.branch, u.year, u.semester, u.section,
             u.group_name, u.created_at, u.department_name
      FROM users u
      LEFT JOIN user_access ua ON ua.user_id = u.id AND ua.revoked_at IS NULL
      WHERE u.is_active AND ${scopeSql(scopes, { person: 'u' }, params)}
    `;
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      query += ` AND COALESCE(ua.role, 'VIEWER') = $${params.length}`;
    }

    query += ` ORDER BY COALESCE(ua.role, 'VIEWER') = 'ADMIN' DESC, COALESCE(ua.role, 'VIEWER') = 'FACULTY' DESC, COALESCE(ua.role, 'VIEWER') = 'STUDENT_REP' DESC, u.created_at DESC`;

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }
    if (offset) {
      params.push(offset);
      query += ` OFFSET $${params.length}`;
    }

    const result = await db.query(query, params);
    return result.rows;
  },

  /** Active students (class representatives included) for the export, within `scopes`. */
  students: async (scopes = null) => {
    const params = [];
    return (await db.query(
      `SELECT u.name, u.email, COALESCE(ua.role, 'VIEWER') AS role, u.branch, u.year, u.section, u.degree, u.department_name, u.roll_no
       FROM users u
       LEFT JOIN user_access ua ON ua.user_id = u.id AND ua.revoked_at IS NULL
       WHERE COALESCE(ua.role, 'VIEWER') IN ('VIEWER', 'STUDENT_REP') AND u.is_active AND ${scopeSql(scopes, { person: 'u' }, params)} ORDER BY u.name`,
      params,
    )).rows;
  },

  /**
   * Count total users (for pagination)
   */
  countUsers: async (search = '', role = '', scopes = null) => {
    const params = [];
    let query = `
      SELECT COUNT(*)
      FROM users u
      ${role ? 'LEFT JOIN user_access ua ON ua.user_id = u.id AND ua.revoked_at IS NULL' : ''}
      WHERE u.is_active AND ${scopeSql(scopes, { person: 'u' }, params)}
    `;
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      query += ` AND COALESCE(ua.role, 'VIEWER') = $${params.length}`;
    }
    const result = await db.query(query, params);
    return parseInt(result.rows[0].count);
  },




  /**
   * Soft-delete a user: the account is deactivated (sessions revoked, upcoming bookings cancelled)
   * but the row and its history stay.
   */
  delete: async (id, client = db) => {
    const result = await client.query(
      `UPDATE users SET is_active = FALSE, deactivated_at = NOW(), session_version = COALESCE(session_version, 0) + 1,
              updated_at = NOW()
        WHERE id = $1 AND is_active RETURNING id`,
      [id],
    );
    if (result.rows[0]) {
      await client.query(
        `UPDATE bookings SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
          WHERE created_by = $1 AND status IN ('ACTIVE', 'PENDING') AND start_time > NOW()
          RETURNING id`,
        [id],
      ).then(async ({ rows }) => {
        // Their supervising faculty learns why the booking disappeared (the booker can't sign in any more).
        for (const { id: bookingId } of rows) {
          const facts = await bookingFacts(client, bookingId);
          if (!facts.booking.faculty_id) continue;
          await notify(client, [{ facultyId: facts.booking.faculty_id }], 'supervised_booking_cancelled',
            { ...facts.data, studentName: facts.data.ownerName, by: 'An administrator', reason: 'the booker\'s account was deactivated' },
            { entityType: 'booking', entityId: bookingId });
        }
        // Withdraw class releases created by cancelled reschedule bookings (NEW-P4-3).
        if (rows.length) {
          await timetableRepository.withdrawReleases('reschedule', rows.map((r) => r.id), client);
          // Classes those bookings had replaced go ahead after all.
          await restoreClassesForBookings(client, rows.map((r) => r.id), { reason: 'cancelled', quiet: false });
        }
      });
    }
    return result.rows[0];
  },

  /**
   * Find approved faculties
   */
  findFaculties: async () => {
    // The faculty directory is CRAS data (faculties table); ids here are faculties.id, which is
    // what bookings.faculty_id references. Soft-deleted entries are hidden.
    const { rows } = await db.query(`
      SELECT f.id, f.name, f.email, COALESCE(f.department_name, u.department_name, 'General') AS department
      FROM faculties f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE f.is_active
      ORDER BY f.name ASC
    `);
    return rows;
  }
};

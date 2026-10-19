import * as db from '../db.js';

/**
 * Repository for User-related database operations
 */
export const userRepository = {
  /**
   * Find a user by ID with department info
   */
  findById: async (id, client = db) => {
    const query = `
      SELECT u.*, d.name as department_name, b.name as branch_name, b.short_code as branch_code
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.id = $1
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Find a user by email with department info
   */
  findByEmail: async (email, client = db) => {
    const query = `
      SELECT u.*, d.name as department_name, b.name as branch_name, b.short_code as branch_code
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.email = $1 AND u.is_active
    `;
    const result = await client.query(query, [email]);
    return result.rows[0];
  },

  findAll: async (limit, offset, search = '', role = '') => {
    let query = `
      SELECT u.id, u.name, u.email, u.role, u.branch, u.branch_id, u.year, u.semester, u.section,
             u.group_name, u.is_approved, u.created_at,
             d.name as department_name, b.name as branch_name, b.short_code as branch_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN branches b ON u.branch_id = b.id
      WHERE u.is_active
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      query += ` AND u.role = $${params.length}`;
    }

    query += ` ORDER BY u.role = 'ADMIN' DESC, u.role = 'FACULTY' DESC, u.role = 'STUDENT_REP' DESC, u.created_at DESC`;

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

  /**
   * Count total users (for pagination)
   */
  countUsers: async (search = '', role = '') => {
    let query = 'SELECT COUNT(*) FROM users u WHERE u.is_active';
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }
    if (role) {
      params.push(role);
      query += ` AND u.role = $${params.length}`;
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
          WHERE created_by = $1 AND status IN ('ACTIVE', 'PENDING') AND start_time > NOW()`,
        [id],
      );
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
      SELECT f.id, f.name, f.email, COALESCE(f.department_name, d.name, 'General') as department
      FROM faculties f
      LEFT JOIN departments d ON f.department_id = d.id
      WHERE f.is_active
      ORDER BY f.name ASC
    `);
    return rows;
  }
};

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
      WHERE u.email = $1
    `;
    const result = await client.query(query, [email]);
    return result.rows[0];
  },

  /**
   * Find all users with department names
   */
  findAll: async (limit, offset) => {
    let query = `
      SELECT u.id, u.name, u.email, u.role, b.name as branch, u.branch_id, u.year, u.semester, u.section,
             u.group_name, u.is_approved, u.created_at,
             d.name as department_name, b.name as branch_name, b.short_code as branch_code
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN branches b ON u.branch_id = b.id
      ORDER BY u.created_at DESC
    `;
    const params = [];
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
  countUsers: async () => {
    const result = await db.query('SELECT COUNT(*) FROM users');
    return parseInt(result.rows[0].count);
  },

  /**
   * Create a new user
   */
  create: async (userData, client = db) => {
    const { name, email, passwordHash, role, branch_id, year, semester, section, group_name, department_id, is_approved } = userData;
    const query = `
      INSERT INTO users (name, email, password_hash, role, branch_id, year, semester, section, group_name, department_id, is_approved) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING id, name, email, role, branch_id, year, semester, section, group_name, department_id, is_approved, created_at
    `;
    const values = [
      name, email, passwordHash, role || 'VIEWER',
      branch_id || null,
      year || null, semester || null,
      section || null, group_name || null,
      department_id, is_approved !== undefined ? is_approved : true
    ];
    const result = await client.query(query, values);
    return result.rows[0];
  },

  /**
   * Update user data
   */
  update: async (id, userData, client = db) => {
    const { name, email, role, branch_id, year, semester, section, group_name, department_id, is_approved } = userData;
    const query = `
      UPDATE users 
      SET name = COALESCE($1, name), 
          email = COALESCE($2, email), 
          role = COALESCE($3, role), 
          branch_id = COALESCE($4, branch_id),
          year = COALESCE($5, year), 
          semester = COALESCE($6, semester),
          section = COALESCE($7, section),
          group_name = COALESCE($8, group_name),
          department_id = COALESCE($9, department_id), 
          is_approved = COALESCE($10, is_approved) 
      WHERE id = $11
      RETURNING id, name, email, role, branch_id, year, semester, section, group_name, department_id, is_approved
    `;
    const values = [name, email, role, branch_id, year, semester, section, group_name, department_id, is_approved, id];
    const result = await client.query(query, values);
    return result.rows[0];
  },

  /**
   * Update user role specifically
   */
  updateRole: async (userId, role, client = db) => {
    const query = 'UPDATE users SET role = $1 WHERE id = $2 RETURNING *';
    const result = await client.query(query, [role, userId]);
    return result.rows[0];
  },

  /**
   * Delete a user
   */
  delete: async (id, client = db) => {
    const query = 'DELETE FROM users WHERE id = $1 RETURNING id';
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Find approved faculties
   */
  findFaculties: async () => {
    const query = `
      SELECT u.id, u.name, u.email, d.name as department 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      WHERE u.role = 'FACULTY' AND u.is_approved = true
      ORDER BY u.name ASC
    `;
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Store a hashed password-reset token and expiry
   */
  setResetToken: async (email, tokenHash, expires) => {
    const query = `
      UPDATE users 
      SET password_reset_token = $1, password_reset_expires = $2 
      WHERE email = $3 
      RETURNING id
    `;
    const result = await db.query(query, [tokenHash, expires, email]);
    return result.rows[0];
  },

  /**
   * Find user by valid (non-expired) reset token hash
   */
  findByResetToken: async (tokenHash) => {
    const query = `
      SELECT id, name, email 
      FROM users 
      WHERE password_reset_token = $1 AND password_reset_expires > NOW()
    `;
    const result = await db.query(query, [tokenHash]);
    return result.rows[0];
  },

  /**
   * Clear the reset token after successful password change
   */
  clearResetToken: async (userId) => {
    const query = `
      UPDATE users 
      SET password_reset_token = NULL, password_reset_expires = NULL 
      WHERE id = $1
    `;
    await db.query(query, [userId]);
  },

  /**
   * Update password hash for a user
   */
  updatePassword: async (userId, passwordHash) => {
    const query = 'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id';
    const result = await db.query(query, [passwordHash, userId]);
    return result.rows[0];
  }
};

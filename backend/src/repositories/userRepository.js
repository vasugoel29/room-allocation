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
      SELECT u.*, d.name as department_name 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
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
      SELECT u.*, d.name as department_name 
      FROM users u 
      LEFT JOIN departments d ON u.department_id = d.id 
      WHERE u.email = $1
    `;
    const result = await client.query(query, [email]);
    return result.rows[0];
  },

  /**
   * Find all users with department names
   */
  findAll: async () => {
    const query = `
      SELECT u.id, u.name, u.email, u.role, u.branch, u.year, u.section, u.is_approved, u.created_at, d.name as department_name
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      ORDER BY u.created_at DESC
    `;
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Create a new user
   */
  create: async (userData, client = db) => {
    const { name, email, passwordHash, role, branch, year, section, department_id, is_approved } = userData;
    const query = `
      INSERT INTO users (name, email, password, role, branch, year, section, department_id, is_approved) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING id, name, email, role, branch, year, section, department_id, is_approved, created_at
    `;
    const values = [name, email, passwordHash, role || 'VIEWER', branch, year, section, department_id, is_approved !== undefined ? is_approved : true];
    const result = await client.query(query, values);
    return result.rows[0];
  },

  /**
   * Update user data
   */
  update: async (id, userData, client = db) => {
    const { name, email, role, branch, year, section, department_id, is_approved } = userData;
    const query = `
      UPDATE users 
      SET name = COALESCE($1, name), 
          email = COALESCE($2, email), 
          role = COALESCE($3, role), 
          branch = COALESCE($4, branch), 
          year = COALESCE($5, year), 
          section = COALESCE($6, section), 
          department_id = COALESCE($7, department_id), 
          is_approved = COALESCE($8, is_approved) 
      WHERE id = $9 
      RETURNING id, name, email, role, branch, year, section, department_id, is_approved
    `;
    const values = [name, email, role, branch, year, section, department_id, is_approved, id];
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
  }
};

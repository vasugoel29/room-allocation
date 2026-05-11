import * as db from '../db.js';

/**
 * Repository for Department database operations
 */
export const departmentRepository = {
  /**
   * Find all departments
   */
  findAll: async () => {
    const query = 'SELECT * FROM departments ORDER BY name ASC';
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Upsert a department by name
   */
  upsert: async (name, client = db) => {
    const query = 'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *';
    const result = await client.query(query, [name]);
    return result.rows[0];
  }
};

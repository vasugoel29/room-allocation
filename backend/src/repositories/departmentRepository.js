import * as db from '../db.js';

/**
 * Repository for Department database operations
 */
export const departmentRepository = {
  findAll: async () => {
    const query = 'SELECT * FROM departments ORDER BY name ASC';
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Find all departments with pagination
   */
  findAllPaginated: async (limit, offset) => {
    const countQuery = 'SELECT COUNT(*) FROM departments';
    const dataQuery = 'SELECT * FROM departments ORDER BY name ASC LIMIT $1 OFFSET $2';
    const [countRes, dataRes] = await Promise.all([
      db.query(countQuery),
      db.query(dataQuery, [limit, offset])
    ]);
    return {
      total: parseInt(countRes.rows[0].count),
      departments: dataRes.rows
    };
  },

  /**
   * Upsert a department by name
   */
  upsert: async (name, client = db) => {
    const query = 'INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *';
    const result = await client.query(query, [name]);
    return result.rows[0];
  },

  /**
   * Update department name
   */
  update: async (id, name, client = db) => {
    const query = 'UPDATE departments SET name = $1 WHERE id = $2 RETURNING *';
    const result = await client.query(query, [name, id]);
    return result.rows[0];
  },

  /**
   * Delete a department
   */
  delete: async (id, client = db) => {
    const query = 'DELETE FROM departments WHERE id = $1 RETURNING *';
    const result = await client.query(query, [id]);
    return result.rows[0];
  }
};

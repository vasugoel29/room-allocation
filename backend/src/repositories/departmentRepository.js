import * as db from '../db.js';

/**
 * Repository for Department database operations
 */
export const departmentRepository = {
  findAll: async () => {
    const query = 'SELECT * FROM departments WHERE is_active ORDER BY name ASC';
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Find all departments with pagination
   */
  findAllPaginated: async (limit, offset) => {
    const countQuery = 'SELECT COUNT(*) FROM departments WHERE is_active';
    const dataQuery = 'SELECT * FROM departments WHERE is_active ORDER BY name ASC LIMIT $1 OFFSET $2';
    const [countRes, dataRes] = await Promise.all([
      db.query(countQuery),
      db.query(dataQuery, [limit, offset])
    ]);
    return {
      total: parseInt(countRes.rows[0].count),
      departments: dataRes.rows
    };
  }
};

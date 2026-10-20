import * as db from '../db.js';

export const branchRepository = {
  findAll: async () => {
    const result = await db.query(`
      SELECT b.*, d.name AS department_name
      FROM branches b
      LEFT JOIN departments d ON d.id = b.department_id
      WHERE b.is_active
      ORDER BY d.name ASC NULLS LAST, b.name ASC
    `);
    return result.rows;
  },

  findAllPaginated: async (limit, offset) => {
    const [countResult, dataResult] = await Promise.all([
      db.query('SELECT COUNT(*) FROM branches WHERE is_active'),
      db.query(`
        SELECT b.*, d.name AS department_name
        FROM branches b
        LEFT JOIN departments d ON d.id = b.department_id
        WHERE b.is_active
        ORDER BY d.name ASC NULLS LAST, b.name ASC
        LIMIT $1 OFFSET $2
      `, [limit, offset])
    ]);
    return { total: Number(countResult.rows[0].count), branches: dataResult.rows };
  }
};

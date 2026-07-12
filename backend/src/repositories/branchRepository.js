import * as db from '../db.js';

export const branchRepository = {
  findAll: async () => {
    const result = await db.query(`
      SELECT b.*, d.name AS department_name
      FROM branches b
      LEFT JOIN departments d ON d.id = b.department_id
      ORDER BY d.name ASC NULLS LAST, b.name ASC
    `);
    return result.rows;
  },

  findAllPaginated: async (limit, offset) => {
    const [countResult, dataResult] = await Promise.all([
      db.query('SELECT COUNT(*) FROM branches'),
      db.query(`
        SELECT b.*, d.name AS department_name
        FROM branches b
        LEFT JOIN departments d ON d.id = b.department_id
        ORDER BY d.name ASC NULLS LAST, b.name ASC
        LIMIT $1 OFFSET $2
      `, [limit, offset])
    ]);
    return { total: Number(countResult.rows[0].count), branches: dataResult.rows };
  },

  create: async ({ name, short_code, department_id }, client = db) => {
    const result = await client.query(
      `INSERT INTO branches (name, short_code, department_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, short_code, department_id]
    );
    return result.rows[0];
  },

  update: async (id, { name, short_code, department_id }, client = db) => {
    const result = await client.query(
      `UPDATE branches
       SET name = $1, short_code = $2, department_id = $3
       WHERE id = $4
       RETURNING *`,
      [name, short_code, department_id, id]
    );
    return result.rows[0];
  },

  delete: async (id, client = db) => {
    const result = await client.query('DELETE FROM branches WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }
};

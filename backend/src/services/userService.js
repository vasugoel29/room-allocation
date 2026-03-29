import * as db from '../db.js';

export const getUsers = async () => {
  const result = await db.query(`
    SELECT u.id, u.name, u.email, u.role, u.branch, u.year, u.section, u.is_approved, u.created_at, d.name as department_name
    FROM users u
    LEFT JOIN departments d ON u.department_id = d.id
    ORDER BY u.created_at DESC
  `);
  return result.rows;
};

export const findByEmail = async (email) => {
  const result = await db.query(`
    SELECT u.*, d.name as department_name 
    FROM users u 
    LEFT JOIN departments d ON u.department_id = d.id 
    WHERE u.email = $1
  `, [email]);
  return result.rows[0];
};

export const findById = async (id) => {
  const result = await db.query(`
    SELECT u.*, d.name as department_name 
    FROM users u 
    LEFT JOIN departments d ON u.department_id = d.id 
    WHERE u.id = $1
  `, [id]);
  return result.rows[0];
};

export const createUser = async (userData) => {
  const { name, email, passwordHash, role, branch, year, section, department_id, is_approved } = userData;
  const result = await db.query(
    'INSERT INTO users (name, email, password, role, branch, year, section, department_id, is_approved) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, name, email, role, branch, year, section, department_id, is_approved, created_at',
    [name, email, passwordHash, role || 'VIEWER', branch, year, section, department_id, is_approved !== undefined ? is_approved : true]
  );
  return result.rows[0];
};

export const updateUser = async (id, userData) => {
  const { name, email, role, branch, year, section, department_id, is_approved } = userData;
  const result = await db.query(
    'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), role = COALESCE($3, role), branch = COALESCE($4, branch), year = COALESCE($5, year), section = COALESCE($6, section), department_id = COALESCE($7, department_id), is_approved = COALESCE($8, is_approved) WHERE id = $9 RETURNING id, name, email, role, branch, year, section, department_id, is_approved',
    [name, email, role, branch, year, section, department_id, is_approved, id]
  );
  return result.rows[0];
};

export const deleteUser = async (id) => {
  const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  return result.rows[0];
};

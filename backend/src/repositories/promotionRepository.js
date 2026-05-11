import * as db from '../db.js';

/**
 * Repository for Promotion Request database operations
 */
export const promotionRepository = {
  /**
   * Create a new promotion request
   */
  createRequest: async (userId, reason) => {
    const query = 'INSERT INTO promotion_requests (user_id, reason) VALUES ($1, $2) RETURNING *';
    const result = await db.query(query, [userId, reason]);
    return result.rows[0];
  },

  /**
   * Find all promotion requests with user details
   */
  findAllRequests: async () => {
    const query = `
      SELECT pr.*, u.name as user_name, u.email as user_email 
      FROM promotion_requests pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.created_at DESC
    `;
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Find a request by ID
   */
  findById: async (id, client = db) => {
    const query = 'SELECT * FROM promotion_requests WHERE id = $1';
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Update request status and comment
   */
  updateStatus: async (id, status, adminComment, client = db) => {
    const query = 'UPDATE promotion_requests SET status = $1, admin_comment = $2, updated_at = NOW() WHERE id = $3 RETURNING *';
    const result = await client.query(query, [status, adminComment, id]);
    return result.rows[0];
  },

  /**
   * Find most recent request for a user
   */
  findByUserId: async (userId) => {
    const query = 'SELECT * FROM promotion_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1';
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
};


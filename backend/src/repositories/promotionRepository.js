import * as db from '../db.js';

/**
 * Repository for Promotion Request database operations
 */
export const promotionRepository = {
  /**
   * Create a new promotion request
   */
  createRequest: async (userId, reason, client = db) => {
    // 1. Insert into requests table
    const reqRes = await client.query(`
      INSERT INTO requests (request_type, requested_by, status, reason)
      VALUES ('PROMOTION', $1, 'PENDING', $2) RETURNING id, status, reason, created_at
    `, [userId, reason]);
    const requestId = reqRes.rows[0].id;
    
    // 2. Insert into promotion_requests detail table
    await client.query(`
      INSERT INTO promotion_requests (request_id, requested_role)
      VALUES ($1, 'STUDENT_REP')
    `, [requestId]);
    
    return {
      id: requestId,
      user_id: userId,
      status: 'PENDING',
      reason,
      created_at: reqRes.rows[0].created_at
    };
  },

  findAllRequests: async () => {
    const query = `
      SELECT r.id, r.requested_by as user_id, r.status, r.reason, r.admin_comment, r.created_at,
             u.name as user_name, u.email as user_email, pr.requested_role
      FROM requests r
      JOIN promotion_requests pr ON r.id = pr.request_id
      JOIN users u ON r.requested_by = u.id
      WHERE r.request_type = 'PROMOTION'
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(query);
    return result.rows;
  },

  /**
   * Find all promotion requests with pagination
   */
  findAllRequestsPaginated: async (limit, offset) => {
    const countQuery = "SELECT COUNT(*) FROM requests WHERE request_type = 'PROMOTION'";
    const dataQuery = `
      SELECT r.id, r.requested_by as user_id, r.status, r.reason, r.admin_comment, r.created_at,
             u.name as user_name, u.email as user_email, pr.requested_role
      FROM requests r
      JOIN promotion_requests pr ON r.id = pr.request_id
      JOIN users u ON r.requested_by = u.id
      WHERE r.request_type = 'PROMOTION'
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    const [countRes, dataRes] = await Promise.all([
      db.query(countQuery),
      db.query(dataQuery, [limit, offset])
    ]);
    return {
      total: parseInt(countRes.rows[0].count),
      requests: dataRes.rows
    };
  },

  /**
   * Find a request by ID
   */
  findById: async (id, client = db) => {
    const query = `
      SELECT r.id, r.requested_by as user_id, r.status, r.reason, r.admin_comment, r.created_at
      FROM requests r
      WHERE r.id = $1 AND r.request_type = 'PROMOTION'
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Update request status and comment
   */
  updateStatus: async (id, status, adminComment, client = db) => {
    const query = `
      UPDATE requests 
      SET status = $1, admin_comment = $2, updated_at = NOW() 
      WHERE id = $3 AND request_type = 'PROMOTION'
      RETURNING id, requested_by as user_id, status, reason, admin_comment, created_at
    `;
    const result = await client.query(query, [status, adminComment, id]);
    return result.rows[0];
  },

  /**
   * Find most recent request for a user
   */
  findByUserId: async (userId) => {
    const query = `
      SELECT r.id, r.requested_by as user_id, r.status, r.reason, r.admin_comment, r.created_at
      FROM requests r
      WHERE r.requested_by = $1 AND r.request_type = 'PROMOTION'
      ORDER BY r.created_at DESC LIMIT 1
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }
};

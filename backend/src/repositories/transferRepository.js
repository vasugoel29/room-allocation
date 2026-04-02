import * as db from '../db.js';

/**
 * Repository for Booking Transfer database operations
 */
export const transferRepository = {
  /**
   * Find a transfer request by ID
   */
  findById: async (id, client = db) => {
    const query = `
      SELECT t.*, b.created_by as owner_id, b.status as booking_status 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      WHERE t.id = $1
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Find a pending transfer request for a specific booking and user
   */
  findPending: async (bookingId, userId) => {
    const query = "SELECT * FROM booking_transfers WHERE booking_id = $1 AND requested_by = $2 AND status = 'PENDING'";
    const result = await db.query(query, [bookingId, userId]);
    return result.rows[0];
  },

  /**
   * Create a new transfer request
   */
  create: async (data, client = db) => {
    const { booking_id, requested_by, target_faculty_id, new_purpose, owner_id } = data;
    const query = `
      INSERT INTO booking_transfers (booking_id, requested_by, target_faculty_id, new_purpose, owner_id) 
      VALUES ($1, $2, $3, $4, $5) RETURNING *`;
    const values = [booking_id, requested_by, target_faculty_id || null, new_purpose, owner_id];
    const result = await client.query(query, values);
    return result.rows[0];
  },

  /**
   * Find incoming requests for a user
   */
  findIncoming: async (userId) => {
    const query = `
      SELECT t.*, r.name as room_name, u.name as requester_name, b.start_time, b.end_time, b.status as booking_status 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON t.requested_by = u.id
      WHERE t.owner_id = $1
      ORDER BY t.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Find outgoing requests for a user
   */
  findOutgoing: async (userId) => {
    const query = `
      SELECT t.*, r.name as room_name, u.name as owner_name, b.start_time, b.end_time, b.status as booking_status 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.created_by = u.id
      WHERE t.requested_by = $1
      ORDER BY t.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Update transfer status
   */
  updateStatus: async (id, status, client = db) => {
    const query = "UPDATE booking_transfers SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *";
    const result = await client.query(query, [status, id]);
    return result.rows[0];
  },

  /**
   * Update other pending transfers for the same booking
   */
  rejectOtherPending: async (bookingId, excludeId, client = db) => {
    const query = "UPDATE booking_transfers SET status = 'REJECTED', updated_at = NOW() WHERE booking_id = $1 AND id != $2 AND status = 'PENDING'";
    return client.query(query, [bookingId, excludeId]);
  },

  /**
   * Reject a transfer using a join (legacy logic)
   */
  rejectWithAuth: async (id, userId, userRole, client = db) => {
    const query = `
      UPDATE booking_transfers t
      SET status = 'REJECTED', updated_at = NOW()
      FROM bookings b
      WHERE t.booking_id = b.id
      AND t.id = $1 AND t.status = 'PENDING'
      AND (b.created_by = $2 OR $3 = 'ADMIN')
      RETURNING t.id
    `;
    const result = await client.query(query, [id, userId, userRole]);
    return result.rows[0];
  }
};

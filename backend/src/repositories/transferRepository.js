import * as db from '../db.js';
import { TRANSFER, sourcesOf } from '../../../shared/stateMachines.js';

/**
 * Repository for Booking Transfer database operations
 */
export const transferRepository = {
  /**
   * Find a transfer request by ID
   */
  findById: async (id, client = db) => {
    const query = `
      SELECT t.*, b.created_by as owner_id, b.status as booking_status, b.faculty_id as owner_faculty_id 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      WHERE t.id = $1
    `;
    const result = await client.query(query, [id]);
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
  findIncoming: async (userId, facultyId = null) => {
    const query = `
      SELECT t.*, r.name as room_name, u.name as requester_name, o.name as requestee_name, b.start_time, b.end_time, b.status as booking_status, b.faculty_id as owner_faculty_id 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON t.requested_by = u.id
      JOIN users o ON b.created_by = o.id
      WHERE (t.owner_id = $1 AND t.status IN ('PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED', 'ACCEPTED', 'REJECTED'))
         OR ($2::int IS NOT NULL AND b.faculty_id = $2 AND t.status = 'REP2_ACCEPTED')
         OR ($2::int IS NOT NULL AND t.target_faculty_id = $2 AND t.status = 'FACULTY2_ACCEPTED')
      ORDER BY t.created_at DESC
    `;
    const result = await db.query(query, [userId, facultyId]);
    return result.rows;
  },

  /**
   * Find outgoing requests for a user
   */
  findOutgoing: async (userId) => {
    const query = `
      SELECT t.*, r.name as room_name, u.name as owner_name, b.start_time, b.end_time, b.status as booking_status, b.faculty_id as owner_faculty_id 
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
   * Move a transfer to `status`. Only the moves in shared/stateMachines.js (TRANSFER) are applied;
   * anything else is a bug in the caller and throws instead of reopening a closed request.
   */
  updateStatus: async (id, status, client = db) => {
    const query = 'UPDATE booking_transfers SET status = $1, updated_at = NOW() WHERE id = $2 AND status = ANY($3) RETURNING *';
    const result = await client.query(query, [status, id, sourcesOf(TRANSFER, status)]);
    if (!result.rows[0]) throw new Error(`Transfer ${id} cannot move to ${status} from its current status`);
    return result.rows[0];
  },
};

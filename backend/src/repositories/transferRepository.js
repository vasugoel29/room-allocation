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
      SELECT 
        r.id, 
        tr.booking_id, 
        r.requested_by, 
        tr.target_faculty_id, 
        tr.new_purpose, 
        tr.owner_id, 
        tr.status, 
        r.created_at,
        b.status as booking_status,
        (
          SELECT req.reviewed_by 
          FROM booking_requests br
          JOIN requests req ON br.request_id = req.id
          WHERE br.resulting_booking_id = tr.booking_id
          LIMIT 1
        ) as owner_faculty_id
      FROM requests r
      JOIN transfer_requests tr ON r.id = tr.request_id
      JOIN bookings b ON tr.booking_id = b.id
      WHERE r.id = $1
    `;
    const result = await client.query(query, [id]);
    return result.rows[0];
  },

  /**
   * Find a pending transfer request for a specific booking and user
   */
  findPending: async (bookingId, userId) => {
    const query = `
      SELECT r.id, tr.*, tr.status
      FROM requests r
      JOIN transfer_requests tr ON r.id = tr.request_id
      WHERE tr.booking_id = $1 AND r.requested_by = $2 
        AND tr.status NOT IN ('ACCEPTED', 'REJECTED')
    `;
    const result = await db.query(query, [bookingId, userId]);
    return result.rows[0];
  },

  /**
   * Create a new transfer request
   */
  create: async (data, client = db) => {
    const { booking_id, requested_by, target_faculty_id, new_purpose, owner_id } = data;
    
    // 1. Insert into requests table
    const reqRes = await client.query(`
      INSERT INTO requests (request_type, requested_by, status, reason)
      VALUES ('TRANSFER', $1, 'PENDING', $2) RETURNING id, status, reason, created_at
    `, [requested_by, new_purpose]);
    const requestId = reqRes.rows[0].id;

    // 2. Insert into transfer_requests table
    await client.query(`
      INSERT INTO transfer_requests (request_id, booking_id, owner_id, target_faculty_id, new_purpose, status)
      VALUES ($1, $2, $3, $4, $5, 'PENDING')
    `, [requestId, booking_id, owner_id, target_faculty_id || null, new_purpose]);

    return {
      id: requestId,
      booking_id,
      requested_by,
      target_faculty_id,
      new_purpose,
      owner_id,
      status: 'PENDING',
      created_at: reqRes.rows[0].created_at
    };
  },

  /**
   * Find incoming requests for a user
   */
  findIncoming: async (userId) => {
    const query = `
      SELECT 
        r.id, 
        tr.booking_id, 
        r.requested_by, 
        tr.target_faculty_id, 
        tr.new_purpose, 
        tr.owner_id, 
        tr.status, 
        r.created_at,
        ro.name as room_name, 
        u.name as requester_name, 
        o.name as requestee_name, 
        b.start_time, 
        b.end_time, 
        b.status as booking_status,
        (
          SELECT req.reviewed_by 
          FROM booking_requests br
          JOIN requests req ON br.request_id = req.id
          WHERE br.resulting_booking_id = tr.booking_id
          LIMIT 1
        ) as owner_faculty_id
      FROM requests r
      JOIN transfer_requests tr ON r.id = tr.request_id
      JOIN bookings b ON tr.booking_id = b.id
      JOIN rooms ro ON b.room_id = ro.id
      JOIN users u ON r.requested_by = u.id
      JOIN users o ON tr.owner_id = o.id
      WHERE (tr.owner_id = $1 AND tr.status IN ('PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED', 'ACCEPTED', 'REJECTED'))
         OR (
           EXISTS (
             SELECT 1 FROM booking_requests br
             JOIN requests req ON br.request_id = req.id
             WHERE br.resulting_booking_id = tr.booking_id AND req.reviewed_by = $1
           ) 
           AND tr.status = 'REP2_ACCEPTED'
         )
         OR (tr.target_faculty_id = $1 AND tr.status = 'FACULTY2_ACCEPTED')
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Find outgoing requests for a user
   */
  findOutgoing: async (userId) => {
    const query = `
      SELECT 
        r.id, 
        tr.booking_id, 
        r.requested_by, 
        tr.target_faculty_id, 
        tr.new_purpose, 
        tr.owner_id, 
        tr.status, 
        r.created_at,
        ro.name as room_name, 
        u.name as owner_name, 
        b.start_time, 
        b.end_time, 
        b.status as booking_status,
        (
          SELECT req.reviewed_by 
          FROM booking_requests br
          JOIN requests req ON br.request_id = req.id
          WHERE br.resulting_booking_id = tr.booking_id
          LIMIT 1
        ) as owner_faculty_id
      FROM requests r
      JOIN transfer_requests tr ON r.id = tr.request_id
      JOIN bookings b ON tr.booking_id = b.id
      JOIN rooms ro ON b.room_id = ro.id
      JOIN users u ON tr.owner_id = u.id
      WHERE r.requested_by = $1
      ORDER BY r.created_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  /**
   * Update transfer status
   */
  updateStatus: async (id, status, client = db) => {
    const query = "UPDATE transfer_requests SET status = $1 WHERE request_id = $2 RETURNING *";
    const result = await client.query(query, [status, id]);
    
    let parentStatus = 'PENDING';
    if (status === 'ACCEPTED') parentStatus = 'APPROVED';
    else if (status === 'REJECTED') parentStatus = 'REJECTED';
    
    await client.query("UPDATE requests SET status = $1, updated_at = NOW() WHERE id = $2", [parentStatus, id]);
    return result.rows[0];
  },

  /**
   * Update other pending transfers for the same booking
   */
  rejectOtherPending: async (bookingId, excludeId, client = db) => {
    const query = `
      UPDATE transfer_requests 
      SET status = 'REJECTED' 
      WHERE booking_id = $1 AND request_id != $2 AND status = 'PENDING'
      RETURNING request_id
    `;
    const result = await client.query(query, [bookingId, excludeId]);
    const requestIds = result.rows.map(row => row.request_id);
    if (requestIds.length > 0) {
      await client.query("UPDATE requests SET status = 'REJECTED', updated_at = NOW() WHERE id = ANY($1)", [requestIds]);
    }
    return result;
  },

  /**
   * Reject a transfer using a join (legacy logic)
   */
  rejectWithAuth: async (id, userId, userRole, client = db) => {
    const query = `
      UPDATE transfer_requests t
      SET status = 'REJECTED'
      FROM bookings b
      WHERE t.booking_id = b.id
        AND t.request_id = $1 AND t.status = 'PENDING'
        AND (b.created_by = $2 OR $3 = 'ADMIN')
      RETURNING t.request_id
    `;
    const result = await client.query(query, [id, userId, userRole]);
    if (result.rowCount > 0) {
      await client.query("UPDATE requests SET status = 'REJECTED', updated_at = NOW() WHERE id = $1", [id]);
    }
    return result.rows[0];
  }
};

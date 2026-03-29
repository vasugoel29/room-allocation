import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';

export const requestTransfer = async (req, res) => {
  const { booking_id, target_faculty_id, new_purpose } = req.body;
  const userId = req.user.id;
  
  try {
    // Basic verification of booking target
    const currentBooking = await db.query(
      "SELECT b.*, u.role as owner_role FROM bookings b JOIN users u ON b.created_by = u.id WHERE b.id = $1", 
      [booking_id]
    );
    if (currentBooking.rows.length === 0) {
      return res.status(404).json({ error: 'Target booking not found' });
    }
    const booking = currentBooking.rows[0];
    
    if ((booking.owner_role === 'admin' || booking.owner_role === 'FACULTY') && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Cannot request transfers for faculty or admin bookings.' });
    }

    if (booking.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Can only request transfer for an ACTIVE booking.' });
    }
    if (booking.created_by === userId) {
      return res.status(400).json({ error: 'Cannot request transfer from yourself.' });
    }
    
    // Check if duplicate request
    const existingReq = await db.query(
      "SELECT * FROM booking_transfers WHERE booking_id = $1 AND requested_by = $2 AND status = 'PENDING'",
      [booking_id, userId]
    );
    if (existingReq.rows.length > 0) {
      return res.status(400).json({ error: 'You have already requested this booking.' });
    }

    const result = await db.query(
      `INSERT INTO booking_transfers (booking_id, requested_by, target_faculty_id, new_purpose, owner_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [booking_id, userId, target_faculty_id || null, new_purpose, booking.created_by]
    );

    res.status(201).json({ message: 'Transfer request sent', transfer: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'You have already requested this transfer.' });
    logger.error('Failed to request transfer', err);
    res.status(500).json({ error: 'Failed to request transfer' });
  }
};

export const getIncomingRequests = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(`
      SELECT t.*, r.name as room_name, u.name as requester_name, b.start_time, b.end_time, b.status as booking_status 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON t.requested_by = u.id
      WHERE t.owner_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    logger.error('Failed to fetch incoming transfers', err);
    res.status(500).json({ error: 'Failed to fetch incoming transfers' });
  }
};

export const getOutgoingRequests = async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(`
      SELECT t.*, r.name as room_name, u.name as owner_name, b.start_time, b.end_time, b.status as booking_status 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.created_by = u.id
      WHERE t.requested_by = $1
      ORDER BY t.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (err) {
    logger.error('Failed to fetch outgoing transfers', err);
    res.status(500).json({ error: 'Failed to fetch outgoing transfers' });
  }
};

export const acceptTransfer = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if user owns the booking associated with this transfer request
    const transferReq = await client.query(`
      SELECT t.*, b.created_by as owner_id, b.status as booking_status 
      FROM booking_transfers t
      JOIN bookings b ON t.booking_id = b.id
      WHERE t.id = $1 AND t.status = 'PENDING'
    `, [id]);
    
    if (transferReq.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Valid pending transfer request not found' });
    }
    
    const t = transferReq.rows[0];
    if (t.owner_id !== userId && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Not authorized to accept this transfer.' });
    }
    
    // The core transfer logic
    const newStatus = t.target_faculty_id ? 'PENDING' : 'ACTIVE'; // If no faculty is required (admin/viewer edge cases), goes active
    await client.query(`
      UPDATE bookings 
      SET created_by = $1, faculty_id = $2, purpose = $3, status = $4, updated_at = NOW()
      WHERE id = $5
    `, [t.requested_by, t.target_faculty_id, t.new_purpose, newStatus, t.booking_id]);
    
    // Mark transfer as accepted
    await client.query("UPDATE booking_transfers SET status = 'ACCEPTED', updated_at = NOW() WHERE id = $1", [id]);
    // Reject other pending requests for the same booking
    await client.query("UPDATE booking_transfers SET status = 'REJECTED', updated_at = NOW() WHERE booking_id = $1 AND id != $2 AND status = 'PENDING'", [t.booking_id, id]);
    
    await client.query('COMMIT');
    cache.deletePattern('room_availability_.*');
    
    res.json({ message: 'Transfer successful' });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to accept transfer', err);
    res.status(500).json({ error: 'Failed to accept transfer' });
  } finally {
    client.release();
  }
};

export const rejectTransfer = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await db.query(`
      UPDATE booking_transfers t
      SET status = 'REJECTED', updated_at = NOW()
      FROM bookings b
      WHERE t.booking_id = b.id
      AND t.id = $1 AND t.status = 'PENDING'
      AND (b.created_by = $2 OR $3 = 'admin')
      RETURNING t.id
    `, [id, userId, req.user.role]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Valid pending transfer request not found or not authorized' });
    }
    
    res.json({ message: 'Transfer rejected' });
  } catch (err) {
    logger.error('Failed to reject transfer', err);
    res.status(500).json({ error: 'Failed to reject transfer' });
  }
};

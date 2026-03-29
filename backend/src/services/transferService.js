import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { transferRepository } from '../repositories/transferRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { userRepository } from '../repositories/userRepository.js';

export const requestTransfer = async (reqData, userId, userRole) => {
  const { booking_id, target_faculty_id, new_purpose } = reqData;

  const booking = await bookingRepository.findById(booking_id);
  if (!booking) {
    return { error: 'Target booking not found', status: 404 };
  }
  
  // Get owner role (we could add this to findById join if needed, but for now let's just fetch it)
  const owner = await userRepository.findById(booking.created_by);
  const owner_role = owner?.role;
  
  if ((owner_role === 'admin' || owner_role === 'FACULTY') && userRole !== 'admin') {
    return { error: 'Cannot request transfers for faculty or admin bookings.', status: 403 };
  }

  if (booking.status !== 'ACTIVE') {
    return { error: 'Can only request transfer for an ACTIVE booking.', status: 400 };
  }
  if (booking.created_by === userId) {
    return { error: 'Cannot request transfer from yourself.', status: 400 };
  }
  
  // Check if duplicate request
  const existingReq = await transferRepository.findPending(booking_id, userId);
  if (existingReq) {
    return { error: 'You have already requested this booking.', status: 400 };
  }

  try {
    const result = await transferRepository.create({
      booking_id, requested_by: userId, target_faculty_id, new_purpose, owner_id: booking.created_by
    });
    return { data: result, status: 201 };
  } catch (err) {
    if (err.code === '23505') return { error: 'You have already requested this transfer.', status: 400 };
    throw err;
  }
};

export const getIncomingRequests = async (userId) => {
  return transferRepository.findIncoming(userId);
};

export const getOutgoingRequests = async (userId) => {
  return transferRepository.findOutgoing(userId);
};

export const acceptTransfer = async (transferId, userId, userRole) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const t = await transferRepository.findById(transferId, client);
    
    if (!t || t.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return { error: 'Valid pending transfer request not found', status: 404 };
    }
    
    if (t.owner_id !== userId && userRole !== 'admin') {
      await client.query('ROLLBACK');
      return { error: 'Not authorized to accept this transfer.', status: 403 };
    }
    
    const newStatus = t.target_faculty_id ? 'PENDING' : 'ACTIVE';
    
    // Manual update for transfer-specific fields
    await client.query(`
      UPDATE bookings 
      SET created_by = $1, faculty_id = $2, purpose = $3, status = $4, updated_at = NOW()
      WHERE id = $5
    `, [t.requested_by, t.target_faculty_id, t.new_purpose, newStatus, t.booking_id]);
    
    await transferRepository.updateStatus(transferId, 'ACCEPTED', client);
    await transferRepository.rejectOtherPending(t.booking_id, transferId, client);
    
    await client.query('COMMIT');
    cache.deletePattern('room_availability_.*');
    return { status: 200, message: 'Transfer successful' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const rejectTransfer = async (transferId, userId, userRole) => {
  const result = await transferRepository.rejectWithAuth(transferId, userId, userRole);
  
  if (!result) {
    return { error: 'Valid pending transfer request not found or not authorized', status: 404 };
  }
  
  return { status: 200, message: 'Transfer rejected' };
};

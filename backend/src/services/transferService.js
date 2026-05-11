import * as db from '../db.js';
import logger from '../utils/logger.js';
import cache from '../utils/cache.js';
import { transferRepository } from '../repositories/transferRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { logActivity } from './loggerService.js';

export const requestTransfer = async (reqData, userId, userRole) => {
  const { booking_id, target_faculty_id, new_purpose } = reqData;

  const booking = await bookingRepository.findById(booking_id);
  if (!booking) {
    return { error: 'Target booking not found', status: 404 };
  }
  
  // Get owner role (we could add this to findById join if needed, but for now let's just fetch it)
  const owner = await userRepository.findById(booking.created_by);
  const owner_role = owner?.role;
  
  if ((owner_role === 'ADMIN' || owner_role === 'FACULTY') && userRole !== 'ADMIN') {
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

    await logActivity({
      userId,
      action: 'REQUEST_TRANSFER',
      entityType: 'transfer',
      entityId: result.id,
      details: { booking_id, new_purpose }
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
    if (!t) {
      await client.query('ROLLBACK');
      return { error: 'Valid transfer request not found', status: 404 };
    }

    // Step 1: Rep 2 accepts
    if (t.status === 'PENDING') {
      if (t.owner_id !== userId && userRole !== 'ADMIN') {
        await client.query('ROLLBACK');
        return { error: 'Not authorized to accept this transfer.', status: 403 };
      }

      if (t.owner_faculty_id) {
        await transferRepository.updateStatus(transferId, 'REP2_ACCEPTED', client);
        await logActivity({
          userId,
          action: 'ACCEPT_TRANSFER_REP2',
          entityType: 'transfer',
          entityId: transferId,
          details: { booking_id: t.booking_id, step: 'REP2_ACCEPTED' }
        }, client);
        await client.query('COMMIT');
        return { status: 200, message: 'Transfer accepted by class owner. Pending approval from owner faculty.' };
      } else {
        // No owner faculty, mark original booking cancelled (available) and move to next step
        await client.query("UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", [t.booking_id]);
        
        if (t.target_faculty_id) {
          await transferRepository.updateStatus(transferId, 'FACULTY2_ACCEPTED', client);
          await logActivity({
            userId,
            action: 'ACCEPT_TRANSFER_REP2',
            entityType: 'transfer',
            entityId: transferId,
            details: { booking_id: t.booking_id, step: 'FACULTY2_ACCEPTED' }
          }, client);
          await client.query('COMMIT');
          return { status: 200, message: 'Class owner accepted. Pending approval from requester faculty.' };
        } else {
          // No target faculty either! Complete immediately.
          await client.query(`
            UPDATE bookings 
            SET created_by = $1, faculty_id = $2, purpose = $3, status = 'ACTIVE', updated_at = NOW()
            WHERE id = $4
          `, [t.requested_by, null, t.new_purpose, t.booking_id]);

          await transferRepository.updateStatus(transferId, 'ACCEPTED', client);
          await transferRepository.rejectOtherPending(t.booking_id, transferId, client);
          await logActivity({
            userId,
            action: 'ACCEPT_TRANSFER_REP2_COMPLETED',
            entityType: 'transfer',
            entityId: transferId,
            details: { booking_id: t.booking_id, step: 'ACCEPTED' }
          }, client);
          await client.query('COMMIT');
          
          cache.deletePattern('room_availability_.*');
          return { status: 200, message: 'Transfer completed successfully' };
        }
      }
    }

    // Step 2: Faculty of Rep 2 accepts
    if (t.status === 'REP2_ACCEPTED') {
      if (String(t.owner_faculty_id) !== String(userId) && userRole !== 'ADMIN') {
        await client.query('ROLLBACK');
        return { error: 'Not authorized to approve this transfer.', status: 403 };
      }

      // Mark slot available (original booking cancelled)
      await client.query("UPDATE bookings SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1", [t.booking_id]);

      if (t.target_faculty_id) {
        await transferRepository.updateStatus(transferId, 'FACULTY2_ACCEPTED', client);
        await logActivity({
          userId,
          action: 'APPROVE_TRANSFER_FACULTY2',
          entityType: 'transfer',
          entityId: transferId,
          details: { booking_id: t.booking_id, step: 'FACULTY2_ACCEPTED' }
        }, client);
        await client.query('COMMIT');
        return { status: 200, message: 'Owner faculty approved. Pending approval from requester faculty.' };
      } else {
        // Complete transfer directly if no target faculty
        await client.query(`
          UPDATE bookings 
          SET created_by = $1, faculty_id = $2, purpose = $3, status = 'ACTIVE', updated_at = NOW()
          WHERE id = $4
        `, [t.requested_by, null, t.new_purpose, t.booking_id]);

        await transferRepository.updateStatus(transferId, 'ACCEPTED', client);
        await transferRepository.rejectOtherPending(t.booking_id, transferId, client);
        await logActivity({
          userId,
          action: 'APPROVE_TRANSFER_FACULTY2_COMPLETED',
          entityType: 'transfer',
          entityId: transferId,
          details: { booking_id: t.booking_id, step: 'ACCEPTED' }
        }, client);
        await client.query('COMMIT');

        cache.deletePattern('room_availability_.*');
        return { status: 200, message: 'Transfer completed successfully' };
      }
    }

    // Step 3: Faculty of Rep 1 accepts
    if (t.status === 'FACULTY2_ACCEPTED') {
      if (String(t.target_faculty_id) !== String(userId) && userRole !== 'ADMIN') {
        await client.query('ROLLBACK');
        return { error: 'Not authorized to approve this transfer.', status: 403 };
      }

      await client.query(`
        UPDATE bookings 
        SET created_by = $1, faculty_id = $2, purpose = $3, status = 'ACTIVE', updated_at = NOW()
        WHERE id = $4
      `, [t.requested_by, t.target_faculty_id, t.new_purpose, t.booking_id]);

      await transferRepository.updateStatus(transferId, 'ACCEPTED', client);
      await transferRepository.rejectOtherPending(t.booking_id, transferId, client);
      await logActivity({
        userId,
        action: 'APPROVE_TRANSFER_FACULTY1',
        entityType: 'transfer',
        entityId: transferId,
        details: { booking_id: t.booking_id, step: 'ACCEPTED' }
      }, client);
      await client.query('COMMIT');

      cache.deletePattern('room_availability_.*');
      return { status: 200, message: 'Transfer completed successfully' };
    }

    await client.query('ROLLBACK');
    return { error: 'Invalid transfer status', status: 400 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const rejectTransfer = async (transferId, userId, userRole) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const t = await transferRepository.findById(transferId, client);
    if (!t) {
      await client.query('ROLLBACK');
      return { error: 'Transfer not found', status: 404 };
    }

    const isAuthorized = t.owner_id === userId ||
      String(t.owner_faculty_id) === String(userId) ||
      String(t.target_faculty_id) === String(userId) ||
      userRole === 'ADMIN';

    if (!isAuthorized) {
      await client.query('ROLLBACK');
      return { error: 'Not authorized to reject this transfer', status: 403 };
    }

    await transferRepository.updateStatus(transferId, 'REJECTED', client);
    await logActivity({
      userId,
      action: 'REJECT_TRANSFER',
      entityType: 'transfer',
      entityId: transferId,
      details: { booking_id: t.booking_id }
    }, client);
    await client.query('COMMIT');
    return { status: 200, message: 'Transfer rejected' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

import * as db from '../db.js';
import cache from '../utils/cache.js';
import { transferRepository } from '../repositories/transferRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { facultyRepository } from '../repositories/facultyRepository.js';
import { logActivity } from './loggerService.js';
import { checkTimes, checkPeopleTimetables, checkBookingConflicts } from './bookingRules.js';
import { canBookDirect, isAdmin as hasAdmin, effectivePermissions, PERMISSIONS as P } from '../auth/permissions.js';
import { inTransaction } from './bookingService.js';
import { notify, bookingFacts, personName } from '../notifications/notify.js';

/**
 * Booking transfers: a student asks for someone else's upcoming booking.
 *
 *   PENDING ──owner accepts──▶ REP2_ACCEPTED (if the booking has a supervising faculty)
 *          └─────────────────▶ FACULTY2_ACCEPTED (no owner faculty, requester named one)
 *          └─────────────────▶ ACCEPTED (neither)
 *   REP2_ACCEPTED ──owner's faculty approves──▶ FACULTY2_ACCEPTED | ACCEPTED
 *   FACULTY2_ACCEPTED ──requester's faculty approves──▶ ACCEPTED
 *   any open state ──reject (owner / a faculty in the chain / admin) or withdraw (requester)──▶ REJECTED / CANCELLED
 *
 * The booking stays ACTIVE with its owner until the final step, which moves ownership in one
 * locked transaction after re-checking the booking is still ACTIVE and upcoming and the requester
 * (and their faculty) are free. Nothing is cancelled mid-flow, so a rejection can't lose a booking
 * and a completed transfer can't resurrect a cancelled one (BKG-06).
 */

const OPEN = ['PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED'];
const fail = (error, status = 400, extra = {}) => ({ error, status, ...extra });

async function lockTransfer(client, transferId) {
  const id = Number(transferId);
  if (!Number.isInteger(id) || id <= 0) return { error: 'Transfer not found', status: 404 };
  const { rows: [t] } = await client.query('SELECT * FROM booking_transfers WHERE id = $1 FOR UPDATE', [id]);
  if (!t) return { error: 'Transfer not found', status: 404 };
  const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [t.booking_id]);
  return { t, booking };
}

/** Template data for a transfer: the booking's room/time plus who asked and who owns it. */
async function transferFacts(client, t) {
  const facts = await bookingFacts(client, t.booking_id);
  return { ...facts?.data, requesterName: await personName(client, t.requested_by) };
}
const meta = (t, actorId) => ({ actorId, entityType: 'transfer', entityId: t.id });

const bookingUpcomingActive = (booking) =>
  booking && booking.status === 'ACTIVE' && new Date(booking.start_time).getTime() > Date.now();

/** Does this user's ACL snapshot let them book without approval (i.e. staff)? */
async function ownerBooksDirect(client, userId) {
  const { rows: [r] } = await client.query('SELECT permissions FROM user_access WHERE user_id = $1', [userId]);
  return effectivePermissions(r?.permissions || []).has(P.BOOKINGS_DIRECT);
}

export const requestTransfer = async (reqData, principal) => {
  const { booking_id, target_faculty_id, new_purpose } = reqData;
  const userId = principal.id;
  return inTransaction(async (client) => {
    const { rows: [booking] } = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [booking_id]);
    if (!booking) return fail('Target booking not found', 404);
    if (booking.status !== 'ACTIVE') return fail('Can only request transfer for an ACTIVE booking.');
    if (new Date(booking.start_time).getTime() <= Date.now()) return fail('This booking has already started and can no longer be transferred.');
    if (booking.created_by === userId) return fail('Cannot request transfer from yourself.');

    // Staff bookings (owner books without approval) can't be requested, except by the admin.
    if (!hasAdmin(principal) && await ownerBooksDirect(client, booking.created_by)) {
      return fail('Cannot request transfers for faculty or admin bookings.', 403);
    }

    // Students taking over a booking need a supervising faculty, like any student booking.
    const given = target_faculty_id !== undefined && target_faculty_id !== null && target_faculty_id !== '';
    if (!given && !canBookDirect(principal)) return fail('Choose the faculty member who will approve this booking');
    if (given && !(await facultyRepository.findActiveById(target_faculty_id, client))) {
      return fail('Selected faculty member was not found');
    }

    const { rows: [existing] } = await client.query(
      `SELECT id FROM booking_transfers WHERE booking_id = $1 AND requested_by = $2 AND status = ANY($3)`,
      [booking_id, userId, OPEN],
    );
    if (existing) return fail('You have already requested this booking.');

    const created = await transferRepository.create({
      booking_id, requested_by: userId, target_faculty_id: given ? target_faculty_id : null, new_purpose, owner_id: booking.created_by,
    }, client);
    await logActivity({
      userId, action: 'REQUEST_TRANSFER', entityType: 'transfer', entityId: created.id, details: { booking_id },
    }, client);
    await notify(client, [{ userId: booking.created_by }], 'transfer_requested', await transferFacts(client, created), meta(created, userId));
    return { data: created, status: 201 };
  });
};

export const getIncomingRequests = async (userId, facultyId = null) => {
  return transferRepository.findIncoming(userId, facultyId);
};

export const getOutgoingRequests = async (userId) => {
  return transferRepository.findOutgoing(userId);
};

/** Final step: re-validate and move the booking to the requester. */
async function closeUnavailable(client, t, actorId, reason) {
  await transferRepository.updateStatus(t.id, 'REJECTED', client);
  await notify(client, [{ userId: t.requested_by }], 'transfer_rejected',
    { ...(await transferFacts(client, t)), by: 'CRAS', reason }, meta(t, actorId));
}

async function completeTransfer(client, t, booking, actorId) {
  if (!bookingUpcomingActive(booking)) {
    await closeUnavailable(client, t, actorId, 'the booking is no longer available');
    return fail('This booking is no longer available for transfer.', 409, { conflict: { type: 'booking_unavailable' }, commit: true });
  }
  const requester = await userRepository.findById(t.requested_by, client);
  if (!requester || requester.is_active === false) {
    await closeUnavailable(client, t, actorId, 'the requester can no longer receive it');
    return fail('The requester can no longer receive this booking.', 409, { commit: true });
  }
  const faculty = t.target_faculty_id ? await facultyRepository.findById(t.target_faculty_id, client) : null;
  const times = checkTimes(booking.start_time, booking.end_time, { direct: true, admin: true, mode: 'approve' });
  if (times.error) return times;
  const people = await checkPeopleTimetables(client, requester, faculty, times.ok);
  if (people) return people;
  const conflict = await checkBookingConflicts(client, {
    roomId: booking.room_id, personId: requester.id, faculty, t: times.ok, excludeId: booking.id,
  });
  if (conflict) return conflict;

  const facts = await transferFacts(client, t);
  await client.query(
    `UPDATE bookings SET created_by = $1, faculty_id = $2, purpose = COALESCE($3, purpose), updated_at = NOW() WHERE id = $4`,
    [t.requested_by, t.target_faculty_id ?? null, t.new_purpose || null, booking.id],
  );
  await transferRepository.updateStatus(t.id, 'ACCEPTED', client);
  const { rows: losers } = await client.query(
    `UPDATE booking_transfers SET status = 'REJECTED', updated_at = NOW() WHERE booking_id = $1 AND id <> $2 AND status = ANY($3)
     RETURNING id, booking_id, requested_by`,
    [booking.id, t.id, OPEN],
  );
  await notify(client, [{ userId: t.requested_by }], 'transfer_completed', facts, meta(t, actorId));
  await notify(client, [{ userId: booking.created_by }], 'transfer_completed_owner', facts, meta(t, actorId));
  for (const other of losers) {
    await notify(client, [{ userId: other.requested_by }], 'transfer_rejected',
      { ...facts, by: 'CRAS', reason: 'the booking went to another request' }, meta(other, actorId));
  }
  await logActivity({
    userId: actorId, action: 'COMPLETE_TRANSFER', entityType: 'transfer', entityId: t.id,
    details: { booking_id: booking.id, from_user: booking.created_by, to_user: t.requested_by },
  }, client);
  cache.deletePattern('admin_status_.*');
  cache.delete('room_availability_all');
  return { status: 200, message: 'Transfer completed successfully' };
}

export const acceptTransfer = async (transferId, principal) => {
  const userId = principal.id;
  const facultyId = principal.faculty_id ?? null;
  return inTransaction(async (client) => {
    const locked = await lockTransfer(client, transferId);
    if (locked.error) return locked;
    const { t, booking } = locked;
    if (!OPEN.includes(t.status)) return fail(`This transfer is already ${t.status.toLowerCase()}.`, 409);
    if (!bookingUpcomingActive(booking)) {
      await closeUnavailable(client, t, userId, 'the booking is no longer available');
      return fail('This booking is no longer available for transfer.', 409, { conflict: { type: 'booking_unavailable' }, commit: true });
    }

    const isAdmin = hasAdmin(principal);
    const ownerFaculty = booking.faculty_id;
    const step = async (next, action, message) => {
      if (next === 'ACCEPTED') return completeTransfer(client, t, booking, userId);
      await transferRepository.updateStatus(t.id, next, client);
      await logActivity({ userId, action, entityType: 'transfer', entityId: t.id, details: { booking_id: t.booking_id, step: next } }, client);
      // The next approver: the owner's faculty, then the requester's.
      const facts = { ...(await transferFacts(client, t)), ownerName: (await bookingFacts(client, t.booking_id))?.data.ownerName };
      const approver = next === 'REP2_ACCEPTED' ? ownerFaculty : t.target_faculty_id;
      if (approver) await notify(client, [{ facultyId: approver }], 'transfer_needs_approval', facts, meta(t, userId));
      await notify(client, [{ userId: t.requested_by }], 'transfer_progress', { ...facts, by: await personName(client, userId) }, meta(t, userId));
      return { status: 200, message };
    };

    if (t.status === 'PENDING') {
      if (booking.created_by !== userId && !isAdmin) return fail('Not authorized to accept this transfer.', 403);
      if (ownerFaculty) return step('REP2_ACCEPTED', 'ACCEPT_TRANSFER_OWNER', 'Transfer accepted by the booking owner. Pending approval from their faculty.');
      if (t.target_faculty_id) return step('FACULTY2_ACCEPTED', 'ACCEPT_TRANSFER_OWNER', 'Booking owner accepted. Pending approval from the requester\'s faculty.');
      return step('ACCEPTED');
    }
    if (t.status === 'REP2_ACCEPTED') {
      if (!isAdmin && (facultyId == null || String(ownerFaculty) !== String(facultyId))) return fail('Not authorized to approve this transfer.', 403);
      if (t.target_faculty_id) return step('FACULTY2_ACCEPTED', 'APPROVE_TRANSFER_OWNER_FACULTY', 'Owner faculty approved. Pending approval from the requester\'s faculty.');
      return step('ACCEPTED');
    }
    // FACULTY2_ACCEPTED
    if (!isAdmin && (facultyId == null || String(t.target_faculty_id) !== String(facultyId))) return fail('Not authorized to approve this transfer.', 403);
    return step('ACCEPTED');
  });
};

export const rejectTransfer = async (transferId, principal) => {
  const userId = principal.id;
  const facultyId = principal.faculty_id ?? null;
  return inTransaction(async (client) => {
    const locked = await lockTransfer(client, transferId);
    if (locked.error) return locked;
    const { t, booking } = locked;
    if (!OPEN.includes(t.status)) return fail(`This transfer is already ${t.status.toLowerCase()}.`, 409);

    const isRequester = t.requested_by === userId;
    const isAuthorized = isRequester ||
      booking?.created_by === userId ||
      (facultyId != null && String(booking?.faculty_id) === String(facultyId)) ||
      (facultyId != null && String(t.target_faculty_id) === String(facultyId)) ||
      hasAdmin(principal);
    if (!isAuthorized) return fail('Not authorized to reject this transfer', 403);

    // The requester closing their own request is a withdrawal, whatever their role.
    const status = isRequester ? 'CANCELLED' : 'REJECTED';
    await transferRepository.updateStatus(t.id, status, client);
    const facts = await transferFacts(client, t);
    if (status === 'CANCELLED') {
      if (booking) await notify(client, [{ userId: booking.created_by }], 'transfer_withdrawn', facts, meta(t, userId));
    } else {
      await notify(client, [{ userId: t.requested_by }], 'transfer_rejected', { ...facts, by: await personName(client, userId) }, meta(t, userId));
    }
    await logActivity({
      userId, action: status === 'CANCELLED' ? 'WITHDRAW_TRANSFER' : 'REJECT_TRANSFER', entityType: 'transfer', entityId: t.id,
      details: { booking_id: t.booking_id },
    }, client);
    return { status: 200, message: status === 'CANCELLED' ? 'Transfer request withdrawn' : 'Transfer rejected' };
  });
};

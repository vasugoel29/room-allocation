// The lifecycles in /shared/stateMachines.js: the tables themselves, that the database agrees with
// them, that repositories refuse moves they don't list, and that a booking entering CANCELLED has
// the same consequences whichever way it got there.
import request from 'supertest';
import app from '../../src/server.js';
import * as db from '../../src/db.js';
import {
  MACHINES, BOOKING, TRANSFER, CANCELLATION_REQUEST, EMAIL, IMPORT_JOB, TONES,
  stateIds, openStates, isOpen, isTerminal, canTransition, sourcesOf, statusLabel, statusTone,
} from '../../../shared/stateMachines.js';
import { bookingRepository } from '../../src/repositories/bookingRepository.js';
import { transferRepository } from '../../src/repositories/transferRepository.js';
import { startJob, finishJob, failJob, getJob } from '../../src/services/importJobs.js';
import { createAdmin, createRep, createFaculty, createRoom, insertBooking, futureSlot, closeDb } from '../../test/helpers/factories.js';
import { getBooking, insertRelease, releasesFor } from '../../test/helpers/bookings.js';

afterAll(closeDb);

let admin;
beforeAll(async () => { admin = await createAdmin(); });

const insertTransfer = async (booking, requester, status = 'PENDING') => (await db.query(
  `INSERT INTO booking_transfers (booking_id, requested_by, owner_id, new_purpose, status)
   VALUES ($1, $2, $3, 'take over', $4) RETURNING *`, [booking.id, requester.user.id, booking.created_by, status])).rows[0];
const transferStatus = async (id) => (await db.query('SELECT status FROM booking_transfers WHERE id = $1', [id])).rows[0].status;

/** An upcoming ACTIVE booking with one transfer in each given status. */
async function bookingWithTransfers(statuses, { hour = 11 } = {}) {
  const [owner, room] = await Promise.all([createRep(), createRoom()]);
  const slot = futureSlot({ hour });
  const booking = await insertBooking({ room_id: room.id, created_by: owner.user.id, start_time: slot.start, end_time: slot.end });
  const transfers = {};
  for (const status of statuses) transfers[status] = await insertTransfer(booking, await createRep(), status);
  return { owner, room, slot, booking, transfers };
}

describe('shared/stateMachines', () => {
  test.each(Object.entries(MACHINES))('%s: every state has a label and a known tone; terminal states have no exits', (_, machine) => {
    for (const id of stateIds(machine)) {
      const s = machine.states[id];
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
      expect(TONES).toContain(s.tone);
      expect(s.terminal).toBe(s.to.length === 0);
      for (const target of s.to) expect(stateIds(machine)).toContain(target);
    }
    for (const id of machine.initial) expect(stateIds(machine)).toContain(id);
  });

  test('booking moves', () => {
    expect(openStates(BOOKING)).toEqual(['PENDING', 'ACTIVE']);
    expect(sourcesOf(BOOKING, 'CANCELLED')).toEqual(['PENDING', 'ACTIVE']);
    expect(sourcesOf(BOOKING, 'ACTIVE')).toEqual(['PENDING']);
    expect(sourcesOf(BOOKING, 'REJECTED')).toEqual(['PENDING']);
    expect(canTransition(BOOKING, 'ACTIVE', 'PENDING')).toBe(true); // a moved booking needs re-approval
    expect(canTransition(BOOKING, 'ACTIVE', 'REJECTED')).toBe(false);
    expect(canTransition(BOOKING, 'CANCELLED', 'ACTIVE')).toBe(false);
    expect(canTransition(BOOKING, 'REJECTED', 'PENDING')).toBe(false);
    expect(isTerminal(BOOKING, 'CANCELLED')).toBe(true);
    expect(isOpen(BOOKING, 'PENDING')).toBe(true);
    expect(isOpen(BOOKING, 'NOPE')).toBe(false);
  });

  test('transfer moves', () => {
    expect(openStates(TRANSFER)).toEqual(['PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED']);
    expect(sourcesOf(TRANSFER, 'ACCEPTED')).toEqual(openStates(TRANSFER));
    expect(sourcesOf(TRANSFER, 'REJECTED')).toEqual(openStates(TRANSFER));
    expect(sourcesOf(TRANSFER, 'CANCELLED')).toEqual(openStates(TRANSFER));
    expect(canTransition(TRANSFER, 'FACULTY2_ACCEPTED', 'REP2_ACCEPTED')).toBe(false); // never backwards
    expect(canTransition(TRANSFER, 'CANCELLED', 'REJECTED')).toBe(false); // a withdrawal stays a withdrawal
    expect(canTransition(TRANSFER, 'ACCEPTED', 'REJECTED')).toBe(false);
  });

  test('requests, emails and import jobs', () => {
    expect(openStates(CANCELLATION_REQUEST)).toEqual(['PENDING']);
    expect(openStates(EMAIL)).toEqual(['pending', 'sending']); // what the outbox index covers
    expect(canTransition(EMAIL, 'sending', 'pending')).toBe(true); // retry
    expect(canTransition(EMAIL, 'sent', 'pending')).toBe(false);
    expect(openStates(IMPORT_JOB)).toEqual(['processing']);
  });

  test('labels and tones', () => {
    expect(statusLabel(TRANSFER, 'PENDING')).toBe('Pending');
    expect(statusLabel(TRANSFER, 'PENDING', 'requester')).toBe('Waiting for Owner');
    expect(statusLabel(TRANSFER, 'CANCELLED')).toBe('Withdrawn');
    expect(statusLabel(BOOKING, 'REJECTED')).toBe('Rejected');
    expect(statusLabel(BOOKING, 'SOMETHING_NEW')).toBe('SOMETHING_NEW'); // unknown values still show
    expect(statusLabel(BOOKING, null)).toBe('');
    expect(statusTone(BOOKING, 'ACTIVE')).toBe('success');
    expect(statusTone(BOOKING, 'SOMETHING_NEW')).toBe('neutral');
  });
});

describe('the database allows exactly the states of each machine', () => {
  test.each([
    ['bookings', 'status', BOOKING],
    ['booking_transfers', 'status', TRANSFER],
    ['class_cancellation_requests', 'status', CANCELLATION_REQUEST],
    ['notifications', 'email_status', EMAIL],
    ['import_jobs', 'status', IMPORT_JOB],
  ])('%s.%s', async (table, column, machine) => {
    const { rows } = await db.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = $1::regclass AND c.contype = 'c' AND a.attname = $2 AND array_length(c.conkey, 1) = 1`,
      [table, column],
    );
    const allowed = new Set(rows.flatMap((r) => [...r.def.matchAll(/'([^']+)'/g)].map((m) => m[1])));
    expect([...allowed].sort()).toEqual(stateIds(machine).sort());
  });
});

describe('repositories only apply listed moves', () => {
  test('a CANCELLED or REJECTED booking cannot be reopened; legal moves still work', async () => {
    const { booking } = await bookingWithTransfers([]);
    await db.query("UPDATE bookings SET status = 'CANCELLED' WHERE id = $1", [booking.id]);
    await expect(bookingRepository.updateStatus(booking.id, 'ACTIVE')).rejects.toThrow(/cannot move to ACTIVE/);
    await expect(bookingRepository.updateStatus(booking.id, 'PENDING')).rejects.toThrow(/cannot move to PENDING/);
    expect((await getBooking(booking.id)).status).toBe('CANCELLED');

    const { booking: open } = await bookingWithTransfers([], { hour: 12 });
    await expect(bookingRepository.updateStatus(open.id, 'REJECTED')).rejects.toThrow(/cannot move to REJECTED/); // ACTIVE is never rejected
    expect((await bookingRepository.updateStatus(open.id, 'PENDING')).status).toBe('PENDING');
    expect((await bookingRepository.updateStatus(open.id, 'ACTIVE')).status).toBe('ACTIVE');
    const cancelled = await bookingRepository.updateStatus(open.id, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelled_at).not.toBeNull();
  });

  test('a closed transfer cannot change again', async () => {
    const { transfers } = await bookingWithTransfers(['CANCELLED', 'REJECTED', 'ACCEPTED', 'REP2_ACCEPTED'], { hour: 13 });
    await expect(transferRepository.updateStatus(transfers.CANCELLED.id, 'REJECTED')).rejects.toThrow(/cannot move/);
    await expect(transferRepository.updateStatus(transfers.REJECTED.id, 'ACCEPTED')).rejects.toThrow(/cannot move/);
    await expect(transferRepository.updateStatus(transfers.ACCEPTED.id, 'CANCELLED')).rejects.toThrow(/cannot move/);
    await expect(transferRepository.updateStatus(transfers.REP2_ACCEPTED.id, 'PENDING')).rejects.toThrow(/cannot move/);
    expect((await transferRepository.updateStatus(transfers.REP2_ACCEPTED.id, 'FACULTY2_ACCEPTED')).status).toBe('FACULTY2_ACCEPTED');
  });

  test('a finished import job keeps its result', async () => {
    const done = await startJob('faculty', admin.user.id);
    await finishJob(done, { message: 'ok' });
    await failJob(done, 'late failure');
    expect(await getJob(done)).toMatchObject({ status: 'completed', message: 'ok' });

    const failed = await startJob('faculty', admin.user.id);
    await failJob(failed, 'bad file');
    await finishJob(failed, { message: 'ok' });
    expect(await getJob(failed)).toMatchObject({ status: 'failed', error: 'bad file' });
  });
});

describe('a cancelled booking has the same consequences however it was cancelled', () => {
  const ALL = ['PENDING', 'REP2_ACCEPTED', 'FACULTY2_ACCEPTED', 'CANCELLED', 'ACCEPTED'];
  const expectClosed = async (transfers) => {
    expect(await transferStatus(transfers.PENDING.id)).toBe('REJECTED');
    expect(await transferStatus(transfers.REP2_ACCEPTED.id)).toBe('REJECTED');
    expect(await transferStatus(transfers.FACULTY2_ACCEPTED.id)).toBe('REJECTED');
    expect(await transferStatus(transfers.CANCELLED.id)).toBe('CANCELLED'); // withdrawn stays withdrawn
    expect(await transferStatus(transfers.ACCEPTED.id)).toBe('ACCEPTED');
  };

  test('the owner cancels: open transfers are closed, a withdrawn one stays CANCELLED', async () => {
    const s = await bookingWithTransfers(ALL, { hour: 14 });
    const res = await request(app).patch(`/api/bookings/${s.booking.id}/cancel`).set('Authorization', s.owner.auth).send();
    expect(res.status).toBe(200);
    await expectClosed(s.transfers);
  });

  test('the room is removed: its upcoming bookings are cancelled and their open transfers closed', async () => {
    const s = await bookingWithTransfers(ALL, { hour: 15 });
    const res = await request(app).delete(`/api/rooms/${s.room.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect((await getBooking(s.booking.id)).status).toBe('CANCELLED');
    await expectClosed(s.transfers);
  });

  test('the booker\'s account is deactivated: their upcoming bookings are cancelled and open transfers closed', async () => {
    const s = await bookingWithTransfers(ALL, { hour: 16 });
    const res = await request(app).delete(`/api/auth/users/${s.owner.user.id}`).set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect((await getBooking(s.booking.id)).status).toBe('CANCELLED');
    await expectClosed(s.transfers);
  });

  test('a class-cancellation request for the booking is approved: transfers closed, its class release withdrawn', async () => {
    const fname = `SM Teacher ${Date.now().toString(36)}`;
    const fac = await createFaculty({ name: fname });
    const s = await bookingWithTransfers(ALL, { hour: 10 });
    const release = await insertRelease({ room_id: s.room.id, release_date: s.slot.dateKey, start_hour: 9, source_type: 'reschedule', source_id: s.booking.id });
    expect(release.is_active).toBe(true);
    const created = await request(app).post('/api/timetable/cancellation-requests').set('Authorization', s.owner.auth)
      .send({ room_name: s.room.name, subject_name: 'DSA', date: s.slot.dateKey, hour: 10, faculty_name: fname, booking_id: s.booking.id });
    expect(created.status).toBe(201);
    const res = await request(app).patch(`/api/timetable/cancellation-requests/${created.body.request.id}/approve`).set('Authorization', fac.auth);
    expect(res.status).toBe(200);
    expect((await getBooking(s.booking.id)).status).toBe('CANCELLED');
    await expectClosed(s.transfers);
    expect((await releasesFor('reschedule', s.booking.id)).map((r) => r.is_active)).toEqual([false]);
  });
});

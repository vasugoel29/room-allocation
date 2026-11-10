/**
 * Every lifecycle in CRAS, in one place. The backend moves rows through these tables, the frontend
 * renders badges from them, and tests pin them to the database CHECK constraints.
 *
 * Rule: never write a status literal to perform or describe a transition. Add the state or the
 * edge here, then use the helpers below. SQL read filters may keep their literals; the integrity
 * test fails if a table's CHECK constraint and its machine ever disagree.
 *
 * BOOKING (bookings.status)
 *   created ──student names a faculty──▶ PENDING ──faculty/admin approves──▶ ACTIVE
 *   created ──staff or admin books directly──────────────────────────────▶ ACTIVE
 *   PENDING ──faculty/admin rejects, or the room goes to another request──▶ REJECTED
 *   ACTIVE  ──student moves an approved booking (needs re-approval)───────▶ PENDING
 *   PENDING | ACTIVE ──cancelled (owner, faculty, admin, room or account removed)──▶ CANCELLED
 *
 * TRANSFER (booking_transfers.status): a student asks for someone else's upcoming booking.
 *   PENDING ──owner accepts──▶ REP2_ACCEPTED (the booking has a supervising faculty)
 *          └────────────────▶ FACULTY2_ACCEPTED (no owner faculty, requester named one)
 *          └────────────────▶ ACCEPTED (neither)
 *   REP2_ACCEPTED ──owner's faculty approves──▶ FACULTY2_ACCEPTED | ACCEPTED
 *   FACULTY2_ACCEPTED ──requester's faculty approves──▶ ACCEPTED
 *   any open state ──declined, or the booking is no longer available──▶ REJECTED
 *   any open state ──the requester withdraws──▶ CANCELLED
 *   The booking stays ACTIVE with its owner until ACCEPTED, which moves ownership in one locked
 *   transaction (see backend/src/services/transferService.js).
 *
 * CANCELLATION_REQUEST (class_cancellation_requests.status)
 *   PENDING ──the class's teacher decides──▶ APPROVED | REJECTED
 *
 * EMAIL (notifications.email_status): the outbox, see backend/src/notifications/emailWorker.js
 *   none (in-app only)        pending ──worker claims──▶ sending ──▶ sent | failed | logged
 *                             sending ──send failed, or the claim went stale──▶ pending (retry)
 *
 * IMPORT_JOB (import_jobs.status)
 *   processing ──▶ completed | failed
 *   A job still `processing` after 15 minutes is reported as failed without changing the row
 *   (backend/src/services/importJobs.js).
 */

/** Tones are meanings, not colours; the frontend maps them to classes (components/ui/StatusBadge.jsx). */
export const TONES = Object.freeze(['pending', 'warning', 'info', 'success', 'danger', 'neutral']);

function defineMachine({ name, initial, states }) {
  const frozen = {};
  for (const [id, s] of Object.entries(states)) {
    const to = Object.freeze([...(s.to || [])]);
    frozen[id] = Object.freeze({ ...s, id, to, terminal: to.length === 0 });
  }
  for (const s of Object.values(frozen)) {
    for (const target of s.to) {
      if (!frozen[target]) throw new Error(`${name}: ${s.id} points to unknown state ${target}`);
    }
  }
  return Object.freeze({ name, initial: Object.freeze([].concat(initial)), states: Object.freeze(frozen) });
}

export const BOOKING = defineMachine({
  name: 'booking',
  initial: ['PENDING', 'ACTIVE'],
  states: {
    PENDING: { label: 'Pending', tone: 'pending', to: ['ACTIVE', 'REJECTED', 'CANCELLED'] },
    ACTIVE: { label: 'Valid', tone: 'success', to: ['PENDING', 'CANCELLED'] },
    CANCELLED: { label: 'Revoked', tone: 'danger' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
  },
});

export const TRANSFER = defineMachine({
  name: 'transfer',
  initial: 'PENDING',
  states: {
    PENDING: {
      label: 'Pending', labelFor: { requester: 'Waiting for Owner' }, tone: 'pending',
      to: ['REP2_ACCEPTED', 'FACULTY2_ACCEPTED', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
    },
    REP2_ACCEPTED: { label: 'Owner Accepted', tone: 'warning', to: ['FACULTY2_ACCEPTED', 'ACCEPTED', 'REJECTED', 'CANCELLED'] },
    FACULTY2_ACCEPTED: { label: 'Awaiting faculty approval', tone: 'info', to: ['ACCEPTED', 'REJECTED', 'CANCELLED'] },
    ACCEPTED: { label: 'Transferred', tone: 'success' },
    REJECTED: { label: 'Declined', tone: 'danger' },
    CANCELLED: { label: 'Withdrawn', tone: 'neutral' },
  },
});

export const CANCELLATION_REQUEST = defineMachine({
  name: 'class cancellation request',
  initial: 'PENDING',
  states: {
    PENDING: { label: 'Pending', tone: 'pending', to: ['APPROVED', 'REJECTED'] },
    APPROVED: { label: 'Approved', tone: 'success' },
    REJECTED: { label: 'Rejected', tone: 'danger' },
  },
});

export const EMAIL = defineMachine({
  name: 'notification email',
  initial: ['none', 'pending'],
  states: {
    none: { label: 'Not emailed', tone: 'neutral' },
    pending: { label: 'Queued', tone: 'pending', to: ['sending'] },
    sending: { label: 'Sending', tone: 'info', to: ['sent', 'failed', 'logged', 'pending'] },
    sent: { label: 'Sent', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
    logged: { label: 'Logged only', tone: 'neutral' },
  },
});

export const IMPORT_JOB = defineMachine({
  name: 'import job',
  initial: 'processing',
  states: {
    processing: { label: 'Processing', tone: 'pending', to: ['completed', 'failed'] },
    completed: { label: 'Completed', tone: 'success' },
    failed: { label: 'Failed', tone: 'danger' },
  },
});

export const MACHINES = Object.freeze({ BOOKING, TRANSFER, CANCELLATION_REQUEST, EMAIL, IMPORT_JOB });

/** Every state id of a machine. */
export const stateIds = (machine) => Object.keys(machine.states);

/** States a row can still leave (e.g. ACTIVE and PENDING bookings). */
export const openStates = (machine) => stateIds(machine).filter((id) => !machine.states[id].terminal);

export const isOpen = (machine, status) => Boolean(machine.states[status]) && !machine.states[status].terminal;

export const isTerminal = (machine, status) => Boolean(machine.states[status]?.terminal);

export const canTransition = (machine, from, to) => Boolean(machine.states[from]?.to.includes(to));

/** The states a row may be in for a move to `to` to be legal. */
export const sourcesOf = (machine, to) => stateIds(machine).filter((id) => machine.states[id].to.includes(to));

/** Display text for a status; `viewer` picks a per-role wording where one exists (e.g. 'requester'). */
export const statusLabel = (machine, status, viewer) => {
  const s = machine.states[status];
  if (!s) return status ? String(status) : '';
  return (viewer && s.labelFor?.[viewer]) || s.label;
};

export const statusTone = (machine, status) => machine.states[status]?.tone || 'neutral';

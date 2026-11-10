import React from 'react';
import { statusLabel, statusTone } from '../../../../shared/stateMachines.js';

// Tones come from shared/stateMachines.js; this is the only place they become colours.
const TONE_CLASSES = {
  pending: 'bg-tonal-tertiary text-tertiary',
  warning: 'bg-amber-500/20 text-amber-500',
  info: 'bg-blue-500/20 text-blue-500',
  success: 'bg-green-500/10 text-green-500',
  danger: 'bg-red-500/10 text-red-500',
  neutral: 'bg-neutral-500/10 text-neutral-500',
};

const VARIANT_CLASSES = {
  pill: 'text-[10px] font-bold px-3 py-1 rounded-full',
  tag: 'text-[10px] font-semibold px-2 py-0.5 rounded-md inline-block',
};

/**
 * The badge for a status of one of the app's state machines (BOOKING, TRANSFER, …). Every state
 * gets a label, including ones added later, so a row is never shown without its status.
 * `viewer` picks a per-role wording where the machine has one (e.g. 'requester').
 */
const StatusBadge = ({ machine, status, viewer, variant = 'pill', className = '' }) => {
  if (!status) return null;
  return (
    <span className={`${VARIANT_CLASSES[variant] || VARIANT_CLASSES.pill} ${TONE_CLASSES[statusTone(machine, status)]} ${className}`.trim()}>
      {statusLabel(machine, status, viewer)}
    </span>
  );
};

export default StatusBadge;

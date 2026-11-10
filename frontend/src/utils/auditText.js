import { CAMPUS_TIME_ZONE } from './timezone';

/**
 * One plain sentence for an audit-log row (Admin → Audit Log), built from its action and details.
 *
 * Rows come from two places: the services, which log a named action (CREATE_BOOKING, …) with
 * specific details, and the request audit in backend/src/server.js, which logs every successful
 * change as `{ method, path, status, body }`. A row that matches nothing here still gets a
 * readable sentence from its action name, so a new action never shows raw JSON.
 */

const day = new Intl.DateTimeFormat('en-IN', { timeZone: CAMPUS_TIME_ZONE, day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('en-IN', { timeZone: CAMPUS_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });

const valid = (v) => v != null && !Number.isNaN(new Date(v).getTime());

/** "20 Oct, 08:00–09:00" in campus time; '' when the times are missing. */
const slot = (start, end) => {
  if (!valid(start)) return '';
  const from = new Date(start);
  return `${day.format(from)}, ${time.format(from)}${valid(end) ? `–${time.format(new Date(end))}` : ''}`;
};

const room = (d) => (d?.room_name ? `room ${d.room_name}` : d?.room_id != null ? `room #${d.room_id}` : 'a room');
const on = (start, end) => { const s = slot(start, end); return s ? ` on ${s}` : ''; };
const count = (n, word) => `${n ?? 0} ${word}`;
const WHO = { creator: 'the booker', owner: 'the booker', faculty: 'the supervising faculty', admin: 'an administrator', ADMIN: 'an administrator', FACULTY: 'the supervising faculty' };

/** Sentences for the actions the services log by name. */
const NAMED = {
  CREATE_BOOKING: (d) => `Booked ${room(d)}${on(d.start_time, d.end_time)}${d.on_behalf_of ? ` on behalf of user #${d.on_behalf_of}` : ''}.`,
  REQUEST_BOOKING: (d) => `Requested ${room(d)}${on(d.start_time, d.end_time)}; waiting for faculty approval.`,
  APPROVE_BOOKING: (d, id) => `Approved booking #${id}${WHO[d.approved_by] ? ` as ${WHO[d.approved_by]}` : ''}.`,
  REJECT_BOOKING: (d, id) => `Rejected booking request #${id}${WHO[d.rejected_by] ? ` as ${WHO[d.rejected_by]}` : ''}.`,
  CANCEL_BOOKING: (d, id) => `Cancelled booking #${id}${WHO[d.by] ? ` (by ${WHO[d.by]})` : ''}${d.previous_status === 'PENDING' ? ' before it was approved' : ''}.`,
  RESCHEDULE_BOOKING: (d, id) => {
    const moved = d.old && d.new && d.old.room_id !== d.new.room_id ? ` from ${room(d.old)} to ${room(d.new)}` : '';
    const when = d.new ? slot(d.new.start_time, d.new.end_time) : '';
    return `Moved booking #${id}${moved}${when ? ` to ${when}` : ''}${WHO[d.by] ? ` (by ${WHO[d.by]})` : ''}.`;
  },
  CANCEL_CLASS_FOR_BOOKING: (d, id) => `Cancelled ${count(d.classes?.length, 'timetabled class(es)')} on ${d.date || 'that date'} to make way for booking #${id}.`,
  REQUEST_TRANSFER: (d) => `Asked to take over booking #${d.booking_id}.`,
  ACCEPT_TRANSFER_OWNER: (d) => `Agreed to hand over booking #${d.booking_id}; faculty approval is still needed.`,
  APPROVE_TRANSFER_OWNER_FACULTY: (d) => `Approved the transfer of booking #${d.booking_id} as the owner's faculty.`,
  COMPLETE_TRANSFER: (d) => `Booking #${d.booking_id} moved from user #${d.from_user} to user #${d.to_user}.`,
  REJECT_TRANSFER: (d) => `Declined a transfer request for booking #${d.booking_id}.`,
  WITHDRAW_TRANSFER: (d) => `Withdrew their transfer request for booking #${d.booking_id}.`,
  CANCEL_OWN_CLASS: (d) => `Cancelled their own class on ${d.date} at ${String(d.hour).padStart(2, '0')}:00; the room is free for that hour.`,
  RESTORE_OWN_CLASS: (d) => `Restored their class on ${d.date} at ${String(d.hour).padStart(2, '0')}:00.`,
  IMPORT_FACULTY_CSV: (d) => `Imported the faculty directory: ${count(d.created, 'added')}, ${count(d.updated, 'updated')}, ${count(d.deactivated, 'deactivated')}, ${count(d.skipped, 'skipped')}.`,
  IMPORT_TIMETABLE_CSV: (d) => `Imported the faculty timetable: ${count(d.imported, 'classes')}, ${count(d.skipped, 'skipped')}${d.unresolved ? `, ${count(d.unresolved, 'unknown faculty name(s)')}` : ''}.`,
  IMPORT_SECTION_TIMETABLE: (d) => `Imported the section timetable${d.imported != null ? `: ${count(d.imported, 'classes')}` : ''}${d.rejected ? `, ${count(d.rejected, 'rejected')}` : ''}.`,
  SYNC_FACULTIES: (d) => `Faculty directory synced from the college directory: ${count(d.received, 'received')}, ${count(d.skipped, 'skipped')}.`,
  DOWNLOAD_FACULTY_TEMPLATE: () => 'Downloaded the faculty import template.',
  DOWNLOAD_TIMETABLE_TEMPLATE: () => 'Downloaded the timetable import template.',
  EXPORT_STUDENTS_XLSX: () => 'Exported the student list to Excel.',
  EXPORT_FACULTY_XLSX: () => 'Exported the faculty directory to Excel.',
  EXPORT_TIMETABLE_XLSX: (d) => `Exported the ${d.view ? `${String(d.view).toLowerCase()} ` : ''}timetable to Excel.`,
};

const DAY_HOUR = (b) => `${b.day ?? b.date ?? 'that day'} at ${String(b.hour ?? '').padStart(2, '0')}:00`;

/** Sentences for the request audit: [method, path pattern, (body, ...path ids) => text]. */
const ROUTES = [
  ['POST', /^\/api\/auth\/(?:dev-login|login|google)$/, (b) => `Signed in${b.email ? ` as ${b.email}` : ''}.`],
  ['POST', /^\/api\/auth\/logout$/, () => 'Signed out.'],
  ['POST', /^\/api\/auth\/signup$/, (b) => `Created an account for ${b.name || b.email || 'a new user'}${b.role ? ` (${String(b.role).toLowerCase().replace(/_/g, ' ')})` : ''}.`],
  ['DELETE', /^\/api\/auth\/users\/(\d+)$/, (b, id) => `Deactivated user #${id}; their upcoming bookings were cancelled.`],
  ['POST', /^\/api\/bookings\/admin\/quick$/, (b) => `Quick-booked room ${b.room_name || ''} on ${b.date} at ${String(b.slot ?? '').padStart(2, '0')}:00${b.target_user_id ? ` for user #${b.target_user_id}` : ''}.`],
  ['POST', /^\/api\/bookings$/, (b) => `Submitted a booking for ${room(b)}${on(b.start_time, b.end_time)}${b.purpose ? ` (${b.purpose})` : ''}.`],
  ['PATCH', /^\/api\/bookings\/(\d+)\/cancel$/, (b, id) => `Cancelled booking #${id}.`],
  ['PATCH', /^\/api\/bookings\/(\d+)$/, (b, id) => `Moved booking #${id}${b.room_id != null ? ` to ${room(b)}` : ''}${on(b.start_time, b.end_time)}.`],
  ['PATCH', /^\/api\/faculty\/(\d+)\/approve$/, (b, id) => `Approved booking request #${id}.`],
  ['PATCH', /^\/api\/faculty\/(\d+)\/reject$/, (b, id) => `Rejected booking request #${id}.`],
  ['POST', /^\/api\/transfers\/request$/, (b) => `Asked to take over booking #${b.booking_id}.`],
  ['PATCH', /^\/api\/transfers\/(\d+)\/accept$/, (b, id) => `Accepted transfer request #${id}.`],
  ['PATCH', /^\/api\/transfers\/(\d+)\/reject$/, (b, id) => `Declined or withdrew transfer request #${id}.`],
  ['POST', /^\/api\/rooms$/, (b) => `Added room ${b.name || ''}${b.type ? ` (${b.type}${b.capacity ? `, ${b.capacity} seats` : ''})` : ''}.`],
  ['PATCH', /^\/api\/rooms\/(\d+)$/, (b, id) => `Updated room #${id}${b.name ? ` (${b.name})` : ''}.`],
  ['DELETE', /^\/api\/rooms\/(\d+)$/, (b, id) => `Removed room #${id}; its upcoming bookings were cancelled.`],
  ['POST', /^\/api\/availability\/override$/, (b) => `${b.is_available ? 'Freed' : 'Blocked'} room ${b.room_name || ''} on ${DAY_HOUR(b)}.`],
  ['POST', /^\/api\/timetable\/faculty\/override$/, (b) => `${b.is_cancelled === false ? 'Restored' : 'Cancelled'} their class on ${DAY_HOUR(b)}.`],
  ['POST', /^\/api\/timetable\/cancellation-requests$/, (b) => `Asked ${b.faculty_name || 'the faculty'} to cancel ${b.subject_name || 'a class'} in room ${b.room_name || ''} on ${DAY_HOUR(b)}.`],
  ['PATCH', /^\/api\/timetable\/cancellation-requests\/(\d+)\/(approve|reject)$/, (b, id, action) => `${action === 'approve' ? 'Approved' : 'Rejected'} class-cancellation request #${id}.`],
  ['POST', /^\/api\/timetable\/upload$/, () => 'Uploaded a section timetable.'],
  ['POST', /^\/api\/timetable\/slots$/, (b) => `Added a class for ${b.faculty_name || 'a faculty member'} on ${b.day_of_week || ''} ${b.slot_time || ''}.`],
  ['PATCH', /^\/api\/timetable\/slots\/(\d+)$/, (b, id) => `Edited faculty class slot #${id}.`],
  ['DELETE', /^\/api\/timetable\/slots\/(\d+)$/, (b, id) => `Removed faculty class slot #${id}.`],
  ['POST', /^\/api\/admin\/uploads\/import\/faculty$/, () => 'Started a faculty directory import.'],
  ['POST', /^\/api\/admin\/uploads\/import\/timetable$/, () => 'Started a faculty timetable import.'],
  ['PUT', /^\/api\/internal\/faculties$/, () => 'The college directory pushed a faculty update.'],
  ['POST', /^\/api\/notifications\/read-all$/, () => 'Marked all notifications as read.'],
  ['PATCH', /^\/api\/notifications\/(\d+)\/read$/, () => 'Marked a notification as read.'],
  ['DELETE', /^\/api\/notifications\/(\d+)$/, () => 'Dismissed a notification.'],
];

const sentence = (text) => text.replace(/\s+/g, ' ').replace(/\s+([.,;)])/g, '$1').trim();

const VERB = { POST: 'Created', PUT: 'Replaced', PATCH: 'Updated', DELETE: 'Removed' };

export function describeAudit(log) {
  const d = log?.details && typeof log.details === 'object' ? log.details : {};
  const action = String(log?.action || '');
  try {
    if (NAMED[action]) return sentence(NAMED[action](d, log.entity_id));
    if (d.method && d.path) {
      for (const [method, pattern, text] of ROUTES) {
        const match = method === d.method ? pattern.exec(d.path) : null;
        if (match) return sentence(text(d.body && typeof d.body === 'object' ? d.body : {}, ...match.slice(1)));
      }
      // A route this file doesn't know yet: say what was changed from its address.
      const target = d.path.replace(/^\/api\//, '').replace(/\/(\d+)/g, ' #$1').replace(/[/_-]+/g, ' ');
      return sentence(`${VERB[d.method] || 'Changed'} ${target}.`);
    }
  } catch {
    // fall through to the action name
  }
  const words = action.replace(/_/g, ' ').toLowerCase();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}.` : 'No details recorded.';
}

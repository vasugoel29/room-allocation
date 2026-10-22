import { escapeHtml } from '../utils/emailService.js';

/**
 * Notification templates. Each returns { title, body, subject, html, link }:
 *   title/body — the in-app inbox text (plain, never HTML),
 *   subject/html — the email (every interpolated value escaped, SEC-16).
 * Booking purposes are never included: recipients may not be allowed to see them (SEC-10).
 */

const appUrl = () => (process.env.APP_URL || '').replace(/\/+$/, '');

const when = (d) => `${d.date}, ${d.time}`;

function wrap({ heading, intro, rows = [], note, link }) {
  const e = escapeHtml;
  const details = rows.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;padding:20px;margin-bottom:24px;"><tr><td>
        ${rows.map(([k, v]) => `<p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>${e(k)}:</strong> ${e(v)}</p>`).join('')}
      </td></tr></table>`
    : '';
  const base = appUrl();
  const button = base && link
    ? `<p style="margin:0 0 16px;"><a href="${e(base + link)}" style="display:inline-block;background:#5D5FEF;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 20px;border-radius:12px;">Open CRAS</a></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter','Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;"><tr><td align="center">
    <table width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(93,95,239,.08);">
      <tr><td style="background:linear-gradient(135deg,#5D5FEF 0%,#7071AF 100%);padding:28px 32px;text-align:center;">
        <h1 style="margin:0;font-size:18px;font-weight:800;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">Campus Room Allocation</h1>
      </td></tr>
      <tr><td style="padding:32px;">
        <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">${e(heading)}</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#64748b;">${e(intro)}</p>
        ${details}
        ${button}
        ${note ? `<p style="margin:0;font-size:13px;color:#64748b;">${e(note)}</p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #f1f5f9;">
        <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:600;">CRAS · NSUT Room Management · Automated notification</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Builds both channels from one description, so inbox and email always say the same thing. */
const make = ({ title, body, intro = body, rows, note, link }) => ({
  title,
  body,
  link,
  subject: String(title).replace(/[\r\n]+/g, ' ').slice(0, 200),
  html: wrap({ heading: title, intro, rows, note, link }),
});

const slotRows = (d) => [['Room', d.roomName], ['Date', d.date], ['Time', d.time]];

export const TEMPLATES = {
  booking_requested: (d) => make({
    title: `New booking request from ${d.studentName}`,
    body: `${d.studentName} asked for room ${d.roomName} on ${when(d)}. It needs your approval.`,
    rows: [['Student', d.studentName], ...slotRows(d)],
    note: 'Approve or reject it in the Faculty Portal.',
    link: '/faculty',
  }),
  booking_rescheduled: (d) => make({
    title: `Booking moved by ${d.studentName} — needs approval again`,
    body: `${d.studentName} moved a booking you approved to room ${d.roomName} on ${when(d)}. It needs your approval again.`,
    rows: [['Student', d.studentName], ...slotRows(d)],
    link: '/faculty',
  }),
  booking_request_withdrawn: (d) => make({
    title: `${d.studentName} withdrew a booking request`,
    body: `The request for room ${d.roomName} on ${when(d)} was withdrawn; nothing to approve.`,
    rows: [['Student', d.studentName], ...slotRows(d)],
    link: '/faculty',
  }),
  booking_approved: (d) => make({
    title: `Booking approved — room ${d.roomName}`,
    body: `${d.by} approved your booking of room ${d.roomName} on ${when(d)}.`,
    rows: [...slotRows(d), ['Approved by', d.by]],
    link: '/bookings',
  }),
  booking_rejected: (d) => make({
    title: `Booking not approved — room ${d.roomName}`,
    body: `${d.by} did not approve your request for room ${d.roomName} on ${when(d)}. You can request another slot.`,
    rows: [...slotRows(d), ['Reviewed by', d.by]],
    link: '/bookings',
  }),
  booking_cancelled: (d) => make({
    title: `Booking cancelled — room ${d.roomName}`,
    body: `Your booking of room ${d.roomName} on ${when(d)} was cancelled${d.reason ? ` (${d.reason})` : ` by ${d.by}`}.`,
    rows: [...slotRows(d), d.reason ? ['Reason', d.reason] : ['Cancelled by', d.by]],
    link: '/bookings',
  }),
  supervised_booking_cancelled: (d) => make({
    title: `Booking cancelled — ${d.studentName}, room ${d.roomName}`,
    body: `${d.studentName}'s booking of room ${d.roomName} on ${when(d)}, which you supervise, was cancelled${d.reason ? ` (${d.reason})` : ` by ${d.by}`}.`,
    rows: [['Student', d.studentName], ...slotRows(d), d.reason ? ['Reason', d.reason] : ['Cancelled by', d.by]],
    link: '/faculty',
  }),
  booking_moved: (d) => make({
    title: `Your booking was moved — room ${d.roomName}`,
    body: `${d.by} moved your booking to room ${d.roomName} on ${when(d)}.`,
    rows: [...slotRows(d), ['Moved by', d.by]],
    link: '/bookings',
  }),
  booking_created_for_you: (d) => make({
    title: `Room ${d.roomName} booked for you`,
    body: `${d.by} booked room ${d.roomName} for you on ${when(d)}.`,
    rows: [...slotRows(d), ['Booked by', d.by]],
    link: '/bookings',
  }),
  transfer_requested: (d) => make({
    title: `${d.requesterName} asked for your booking`,
    body: `${d.requesterName} requested your booking of room ${d.roomName} on ${when(d)}. Accept or decline it in Bookings.`,
    rows: [['Requested by', d.requesterName], ...slotRows(d)],
    link: '/bookings',
  }),
  transfer_needs_approval: (d) => make({
    title: `Booking transfer needs your approval`,
    body: `${d.ownerName}'s booking of room ${d.roomName} on ${when(d)} is being transferred to ${d.requesterName}.`,
    rows: [['From', d.ownerName], ['To', d.requesterName], ...slotRows(d)],
    link: '/bookings',
  }),
  transfer_progress: (d) => make({
    title: `Transfer request moving — room ${d.roomName}`,
    body: `Your request for room ${d.roomName} on ${when(d)} was accepted by ${d.by} and is waiting for faculty approval.`,
    rows: [...slotRows(d), ['Accepted by', d.by]],
    link: '/bookings',
  }),
  transfer_completed: (d) => make({
    title: `Room ${d.roomName} is now yours`,
    body: `The booking of room ${d.roomName} on ${when(d)} was transferred to you.`,
    rows: slotRows(d),
    link: '/bookings',
  }),
  transfer_completed_owner: (d) => make({
    title: `Your booking was transferred to ${d.requesterName}`,
    body: `Your booking of room ${d.roomName} on ${when(d)} now belongs to ${d.requesterName}.`,
    rows: [['Transferred to', d.requesterName], ...slotRows(d)],
    link: '/bookings',
  }),
  transfer_rejected: (d) => make({
    title: `Transfer request declined — room ${d.roomName}`,
    body: `${d.by} declined your request for room ${d.roomName} on ${when(d)}${d.reason ? ` (${d.reason})` : ''}.`,
    rows: [...slotRows(d), ['Declined by', d.by]],
    link: '/bookings',
  }),
  transfer_withdrawn: (d) => make({
    title: `${d.requesterName} withdrew their transfer request`,
    body: `The request for your booking of room ${d.roomName} on ${when(d)} was withdrawn.`,
    rows: [['Requested by', d.requesterName], ...slotRows(d)],
    link: '/bookings',
  }),
  class_cancellation_requested: (d) => make({
    title: `Cancel class request: ${d.subject}`,
    body: `${d.requesterName} asked to cancel ${d.subject} in room ${d.roomName} on ${when(d)}.`,
    rows: [['Requested by', d.requesterName], ['Class', d.subject], ...slotRows(d)],
    note: 'Approve or reject it in the Faculty Portal.',
    link: '/faculty',
  }),
  class_cancellation_decided: (d) => make({
    title: `Class cancellation ${d.approved ? 'approved' : 'rejected'}: ${d.subject}`,
    body: d.approved
      ? `${d.by} approved cancelling ${d.subject} on ${when(d)}; room ${d.roomName} is free for that hour.`
      : `${d.by} rejected cancelling ${d.subject} on ${when(d)}; the class goes ahead.`,
    rows: [['Class', d.subject], ...slotRows(d), ['Reviewed by', d.by]],
    link: '/timetable',
  }),
  class_cancelled_for_booking: (d) => make({
    title: `Class cancelled: ${d.subject} on ${d.date}`,
    body: `${d.subject} in room ${d.roomName} on ${when(d)} is cancelled: ${d.by} booked the room for that time.`,
    rows: [['Class', d.subject], ...slotRows(d), ['Cancelled by', d.by]],
    note: 'Only this date is affected; the class runs as usual on other days.',
    link: '/timetable',
  }),
  class_restored: (d) => make({
    title: `Class back on: ${d.subject} on ${d.date}`,
    body: `${d.subject} in room ${d.roomName} on ${when(d)} goes ahead after all: the booking that replaced it was ${d.reason}.`,
    rows: [['Class', d.subject], ...slotRows(d)],
    link: '/timetable',
  }),
};

export function render(type, data) {
  const t = TEMPLATES[type];
  if (!t) throw new Error(`Unknown notification type: ${type}`);
  return t(data);
}

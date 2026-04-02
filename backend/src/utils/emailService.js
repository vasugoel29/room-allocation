import nodemailer from 'nodemailer';
import logger from './logger.js';

// ────────────────────────────────────────────────────────────────
// Transporter — Gmail SMTP (free, 500 emails/day with App Password)
// ────────────────────────────────────────────────────────────────
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const FROM_NAME  = process.env.SMTP_FROM_NAME || 'CRAS — Campus Room Allocation';
const FROM_EMAIL = SMTP_USER || 'noreply@nsut.ac.in';

let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Verify connection on startup
  transporter.verify()
    .then(() => logger.info('Email transporter ready'))
    .catch((err) => logger.error('Email transporter verification failed', err));
} else {
  console.warn('[Email] SMTP credentials not set — emails will be logged to console only.');
}

// ────────────────────────────────────────────────────────────────
// Core send helper
// ────────────────────────────────────────────────────────────────
export async function sendEmail(to, subject, html) {
  if (!transporter) {
    console.warn(`[Email][DEV] Would send to ${to}: "${subject}"`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
  } catch (err) {
    // Non-blocking — we never fail the request because of email
    logger.error('Email send failed', { to, subject, error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────
// HTML Template wrapper
// ────────────────────────────────────────────────────────────────
function wrap(body) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter','Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 16px;">
      <tr><td align="center">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(93,95,239,.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#5D5FEF 0%,#7071AF 100%);padding:32px 32px 24px;text-align:center;">
              <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">
                Campus Room Allocation
              </h1>
              <p style="margin:6px 0 0;font-size:10px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:3px;text-transform:uppercase;">
                Structural Precision in Time &amp; Space
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;text-align:center;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:11px;color:#94a3b8;font-weight:600;">
                CRAS · NSUT Room Management · Automated Notification
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
  </html>`;
}

// ────────────────────────────────────────────────────────────────
// Pre-built notification templates
// ────────────────────────────────────────────────────────────────

/**
 * Student submitted a booking request → email to faculty
 */
export function notifyFacultyNewRequest({ facultyName, facultyEmail, studentName, roomName, date, time }) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">New Booking Request</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">A student has submitted a room allocation request that requires your approval.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;padding:20px;margin-bottom:24px;">
      <tr><td>
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Request Details</p>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Student:</strong> ${studentName}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Room:</strong> ${roomName}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Date:</strong> ${date}</p>
        <p style="margin:0;font-size:14px;color:#1e1b4b;"><strong>Time:</strong> ${time}</p>
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#64748b;">Please log in to the Faculty Portal to approve or reject this request.</p>
  `);
  return sendEmail(facultyEmail, `New Booking Request from ${studentName}`, html);
}

/**
 * Faculty approves/rejects a booking → email to student
 */
export function notifyStudentBookingStatus({ studentEmail, studentName, roomName, date, time, status }) {
  const isApproved = status === 'ACTIVE' || status === 'APPROVED';
  const statusLabel = isApproved ? 'Approved ✓' : 'Rejected ✗';
  const statusColor = isApproved ? '#16a34a' : '#dc2626';
  
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">Booking ${statusLabel}</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Your room allocation request has been reviewed by faculty.</p>
    <div style="background:${isApproved ? '#f0fdf4' : '#fef2f2'};border-radius:16px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:24px;font-weight:800;color:${statusColor};">${statusLabel}</p>
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;padding:20px;margin-bottom:24px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Room:</strong> ${roomName}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Date:</strong> ${date}</p>
        <p style="margin:0;font-size:14px;color:#1e1b4b;"><strong>Time:</strong> ${time}</p>
      </td></tr>
    </table>
    <p style="margin:0;font-size:13px;color:#64748b;">${isApproved ? 'Your room has been reserved. You can view it in the Bookings section.' : 'You may submit a new request for a different slot.'}</p>
  `);
  return sendEmail(studentEmail, `Booking ${statusLabel} — Room ${roomName}`, html);
}

/**
 * Booking cancelled → email to creator
 */
export function notifyBookingCancelled({ userEmail, userName, roomName, date, time, cancelledBy }) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">Booking Cancelled</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">A room booking has been cancelled.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:16px;padding:20px;margin-bottom:24px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Room:</strong> ${roomName}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Date:</strong> ${date}</p>
        <p style="margin:0 0 4px;font-size:14px;color:#1e1b4b;"><strong>Time:</strong> ${time}</p>
        ${cancelledBy ? `<p style="margin:0;font-size:14px;color:#1e1b4b;"><strong>Cancelled by:</strong> ${cancelledBy}</p>` : ''}
      </td></tr>
    </table>
  `);
  return sendEmail(userEmail, `Booking Cancelled — Room ${roomName}`, html);
}

/**
 * Admin approves a faculty account → email to faculty
 */
export function notifyFacultyApproved({ facultyEmail, facultyName }) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">Account Activated</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Great news, Prof. ${facultyName}! Your CRAS account has been approved by an administrator.</p>
    <div style="background:#f0fdf4;border-radius:16px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:18px;font-weight:800;color:#16a34a;">Your account is now active ✓</p>
    </div>
    <p style="margin:0;font-size:13px;color:#64748b;">You can now log in to the Faculty Portal to manage booking requests from students.</p>
  `);
  return sendEmail(facultyEmail, 'Your CRAS Account Has Been Approved', html);
}

/**
 * Promotion request result → email to student
 */
export function notifyPromotionResult({ userEmail, userName, status, adminComment }) {
  const isApproved = status === 'APPROVED';
  const statusLabel = isApproved ? 'Approved ✓' : 'Rejected';
  const statusColor = isApproved ? '#16a34a' : '#dc2626';
  
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">Promotion Request ${statusLabel}</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Your request to become a Student Representative has been reviewed.</p>
    <div style="background:${isApproved ? '#f0fdf4' : '#fef2f2'};border-radius:16px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:800;color:${statusColor};">${statusLabel}</p>
    </div>
    ${adminComment ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;padding:20px;margin-bottom:24px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;">Admin Comment</p>
        <p style="margin:0;font-size:14px;color:#1e1b4b;">${adminComment}</p>
      </td></tr>
    </table>` : ''}
    <p style="margin:0;font-size:13px;color:#64748b;">${isApproved ? 'You now have Student Rep access. You can create and manage room bookings directly.' : 'If you believe this was a mistake, please contact your administrator.'}</p>
  `);
  return sendEmail(userEmail, `Promotion Request ${statusLabel}`, html);
}

/**
 * Password reset link → email to user
 */
export function sendPasswordResetEmail({ userEmail, userName, resetLink }) {
  const html = wrap(`
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:800;color:#1e1b4b;">Password Reset</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Hi ${userName}, we received a request to reset your password. Click the button below to set a new one.</p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#5D5FEF,#7071AF);color:#ffffff;padding:14px 40px;border-radius:14px;font-size:13px;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:1.5px;">
        Reset Password
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;">Or paste this link in your browser:</p>
    <p style="margin:0 0 20px;font-size:12px;color:#5D5FEF;word-break:break-all;">${resetLink}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;padding:16px;">
      <tr><td>
        <p style="margin:0;font-size:12px;color:#dc2626;font-weight:600;">⚠ This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </td></tr>
    </table>
  `);
  return sendEmail(userEmail, 'Reset Your CRAS Password', html);
}

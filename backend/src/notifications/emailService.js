import nodemailer from 'nodemailer';
import logger from '../utils/logger.js';

/**
 * SMTP transport. Messages are not sent from request handlers: they are queued in the
 * `notifications` outbox and delivered by src/notifications/emailWorker.js, which retries.
 */
const SMTP_HOST = () => process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = () => parseInt(process.env.SMTP_PORT || '587', 10);
const FROM_NAME = () => process.env.SMTP_FROM_NAME || 'CRAS — Campus Room Allocation';
const FROM_EMAIL = () => process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@nsut.ac.in';

/** True when SMTP credentials are configured. */
export const emailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
let transporterKey = null;
function getTransporter() {
  const key = `${process.env.SMTP_USER}|${SMTP_HOST()}|${SMTP_PORT()}`;
  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST(),
      port: SMTP_PORT(),
      secure: SMTP_PORT() === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    transporterKey = key;
  }
  return transporter;
}

/** Checks the SMTP login once at startup; logs (does not throw) so a mail outage can't stop the API. */
export async function verifyEmailTransport() {
  if (!emailConfigured()) return false;
  try {
    await getTransporter().verify();
    logger.info('Email transporter ready');
    return true;
  } catch (err) {
    logger.error('Email transporter verification failed', err);
    return false;
  }
}

/** Escape a value for interpolation into HTML email (names, room labels, comments) — SEC-16. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Subjects are headers: no CR/LF (header injection) and a sane length. */
export const safeSubject = (subject) => String(subject).replace(/[\r\n]+/g, ' ').slice(0, 200);

/** Sends one message; throws on failure so the outbox can retry it. */
export async function deliverEmail(to, subject, html) {
  const info = await getTransporter().sendMail({
    from: `"${FROM_NAME()}" <${FROM_EMAIL()}>`,
    to,
    subject: safeSubject(subject),
    html,
  });
  return info.messageId;
}

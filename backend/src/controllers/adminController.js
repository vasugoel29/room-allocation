import { istDateTimeToUtc } from '../utils/timezone.js';
import { sendServerError } from '../utils/httpErrors.js';
import { adminRepository } from "../repositories/adminRepository.js";
import { scopesFor } from "../auth/scopes.js";
import { PERMISSIONS as P } from "../auth/permissions.js";
import logger from "../utils/logger.js";

/**
 * Controller for Admin specific operations
 */

/**
 * One CSV cell: always quoted, embedded quotes doubled, and cells that a spreadsheet would treat as
 * a formula (=, +, -, @, tab, CR) prefixed with an apostrophe (SEC-22).
 */
export const csvCell = (val) => {
  let str = val instanceof Date ? val.toISOString() : String(val ?? "");
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return `"${str.replace(/"/g, '""')}"`;
};

const isValidDate = (v) => !Number.isNaN(new Date(v).getTime());

export const exportBookingsCSV = async (req, res) => {
  const { start_date, end_date } = req.query;
  // Validate before anything is written: a bad date used to fail after the 200 was sent (NEW-admin-1).
  if ((start_date && !isValidDate(start_date)) || (end_date && !isValidDate(end_date))) {
    return res.status(400).json({ error: "start_date and end_date must be valid dates" });
  }
  try {
    // A date-only value means the whole IST day: from its 00:00 to the next day's 00:00 (IST).
    const dayOnly = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v));
    const nextDay = (k) => new Date(Date.parse(`${k}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const rows = await adminRepository.exportBookings({
      from: start_date ? (dayOnly(start_date) ? istDateTimeToUtc(start_date, 0) : start_date) : null,
      to: end_date ? (dayOnly(end_date) ? istDateTimeToUtc(nextDay(end_date), 0) : end_date) : null,
      scopes: scopesFor(req.user, P.ADMIN),
    });
    const lines = ["ID,Room,Start Time,End Time,User,Purpose,Status"];
    for (const row of rows) {
      lines.push([row.id, row.room_name, row.start_time, row.end_time, row.user_name, row.purpose, row.status].map(csvCell).join(","));
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=bookings_export_${new Date().toISOString()}.csv`);
    res.send(lines.join("\n") + "\n");
  } catch (err) {
    sendServerError(res, err, "Failed to export CSV");
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    // Clamped, never trusted: page >= 1, 1 <= limit <= 100 (NEW-admin-3).
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = typeof req.query.search === 'string' ? req.query.search : '';

    const { rows, total } = await adminRepository.auditLogs({ search, limit, offset });

    res.json({
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Failed to fetch audit logs', err);
    sendServerError(res, err, 'Failed to fetch audit logs');
  }
};
// "Last N days" = from N days ago up to now; future bookings are not counted (decision 2026-10-20).
// Scoped admins see their rooms and people only.
export const getAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    res.json(await adminRepository.analytics(days, scopesFor(req.user, P.ADMIN)));
  } catch (err) {
    logger.error('Failed to fetch analytics', err);
    sendServerError(res, err, 'Failed to fetch analytics');
  }
};

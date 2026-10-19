import { sendServerError } from '../utils/httpErrors.js';
import * as db from "../db.js";
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
    let query = `
      SELECT b.id, r.name as room_name, b.start_time, b.end_time, u.name as user_name, b.purpose, b.status
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
      JOIN users u ON b.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    if (start_date) {
      params.push(start_date);
      query += ` AND b.start_time >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND b.end_time <= $${params.length}`;
    }
    query += " ORDER BY b.start_time DESC";

    // Pool query: no checked-out client that could leak on error (OPS-07).
    const { rows } = await db.query(query, params);
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

    let queryText = `
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      queryText += ` AND (al.action ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
    }

    const countQuery = `SELECT COUNT(*) FROM (${queryText}) as total`;
    const dataQuery = queryText + ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    
    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, params),
      db.query(dataQuery, [...params, limit, offset])
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      data: dataResult.rows,
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
export const getAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // 1. Overall Utilization
    const utilizationQuery = `
      WITH stats AS (
        SELECT COUNT(*) as booking_count, 
               (SELECT COUNT(*) FROM rooms WHERE is_active) as room_count
        FROM bookings
        WHERE start_time >= NOW() - INTERVAL '1 day' * $1
        AND status = 'ACTIVE'
      )
      SELECT booking_count, 
             room_count,
             (booking_count::float / NULLIF(room_count * 12 * $1, 0)) * 100 as utilization_percent
      FROM stats
    `;

    // 2. Room Utilization (Top 5)
    const roomPerformanceQuery = `
      SELECT r.name, COUNT(b.id) as booking_count
      FROM rooms r
      LEFT JOIN bookings b ON r.id = b.room_id 
        AND b.start_time >= NOW() - INTERVAL '1 day' * $1
        AND b.status = 'ACTIVE'
      GROUP BY r.id, r.name
      ORDER BY booking_count DESC
      LIMIT 5
    `;

    // 3. Peak Hours
    const peakHoursQuery = `
      SELECT EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') as hour, COUNT(*) as count
      FROM bookings
      WHERE start_time >= NOW() - INTERVAL '1 day' * $1
      AND status = 'ACTIVE'
      GROUP BY hour
      ORDER BY hour ASC
    `;

    // 4. Daily Trends
    const dailyTrendsQuery = `
      SELECT (start_time AT TIME ZONE 'Asia/Kolkata')::date as date, COUNT(*) as count
      FROM bookings
      WHERE start_time >= NOW() - INTERVAL '1 day' * $1
      AND status = 'ACTIVE'
      GROUP BY date
      ORDER BY date ASC
    `;

    const [utilRes, roomRes, hoursRes, trendsRes] = await Promise.all([
      db.query(utilizationQuery, [days]),
      db.query(roomPerformanceQuery, [days]),
      db.query(peakHoursQuery, [days]),
      db.query(dailyTrendsQuery, [days])
    ]);

    res.json({
      summary: utilRes.rows[0],
      topRooms: roomRes.rows,
      peakHours: hoursRes.rows,
      dailyTrends: trendsRes.rows
    });
  } catch (err) {
    logger.error('Failed to fetch analytics', err);
    sendServerError(res, err, 'Failed to fetch analytics');
  }
};

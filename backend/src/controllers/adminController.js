import * as db from "../db.js";
import logger from "../utils/logger.js";

/**
 * Controller for Admin specific operations
 */

const sanitizeCSVField = (val) => {
  const str = String(val || "");
  if (["=", "+", "-", "@"].includes(str.charAt(0))) {
    return `'${str}`;
  }
  return str;
};

export const exportBookingsCSV = async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

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

    const client = await db.pool.connect();

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=bookings_export_${new Date().toISOString()}.csv`,
    );

    // CSV Header
    res.write("ID,Room,Start Time,End Time,User,Purpose,Status\n");

    const cursor = await client.query(query, params);

    cursor.rows.forEach((row) => {
      const csvRow = [
        row.id,
        sanitizeCSVField(row.room_name),
        row.start_time,
        row.end_time,
        `"${sanitizeCSVField(row.user_name).replace(/"/g, '""')}"`,
        `"${sanitizeCSVField(row.purpose || "").replace(/"/g, '""')}"`,
        row.status,
      ].join(",");
      res.write(csvRow + "\n");
    });

    res.end();
    client.release();
  } catch (err) {
    logger.error("CSV Export failed", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
};

export const exportPromotionsCSV = async (req, res) => {
  try {
    const query = `
      SELECT p.id, u.name as user_name, u.email, p.requested_role, p.status, p.created_at
      FROM promotions p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `;
    const result = await db.query(query);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=promotions_export_${new Date().toISOString()}.csv`,
    );

    res.write("ID,User,Email,Requested Role,Status,Created At\n");

    result.rows.forEach((row) => {
      const csvRow = [
        row.id,
        `"${sanitizeCSVField(row.user_name).replace(/"/g, '""')}"`,
        sanitizeCSVField(row.email),
        row.requested_role,
        row.status,
        row.created_at,
      ].join(",");
      res.write(csvRow + "\n");
    });

    res.end();
  } catch (err) {
    logger.error("Promotions CSV Export failed", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
};
export const getAuditLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

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
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};
export const getAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // 1. Overall Utilization
    const utilizationQuery = `
      WITH stats AS (
        SELECT COUNT(*) as booking_count, 
               (SELECT COUNT(*) FROM rooms) as room_count
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
      SELECT EXTRACT(HOUR FROM start_time) as hour, COUNT(*) as count
      FROM bookings
      WHERE start_time >= NOW() - INTERVAL '1 day' * $1
      AND status = 'ACTIVE'
      GROUP BY hour
      ORDER BY hour ASC
    `;

    // 4. Daily Trends
    const dailyTrendsQuery = `
      SELECT DATE_TRUNC('day', start_time) as date, COUNT(*) as count
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
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

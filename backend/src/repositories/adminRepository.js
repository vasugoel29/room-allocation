import * as db from '../db.js';
import { scopeSql } from '../auth/scopes.js';

/**
 * Admin Console reads: the bookings export, the audit log and analytics. `scopes` are the admin's
 * ACL scopes (null = unrestricted): bookings count when their booker and room are within them.
 */
export const adminRepository = {
  /** Bookings for the CSV export; `from`/`to` are UTC instants (already resolved from IST days). */
  exportBookings: async ({ from, to, scopes = null }) => {
    const params = [];
    let query = `
      SELECT b.id, r.name AS room_name, b.start_time, b.end_time, u.name AS user_name, b.purpose, b.status
        FROM bookings b
        JOIN rooms r ON b.room_id = r.id
        JOIN users u ON b.created_by = u.id
       WHERE ${scopeSql(scopes, { person: 'u', room: 'r' }, params)}`;
    if (from) { params.push(from); query += ` AND b.start_time >= $${params.length}`; }
    if (to) { params.push(to); query += ` AND b.end_time <= $${params.length}`; }
    return (await db.query(`${query} ORDER BY b.start_time DESC`, params)).rows;
  },

  /** One page of the audit log, newest first; `search` matches the action or the person's name. */
  auditLogs: async ({ search = '', limit, offset }) => {
    const params = [];
    let where = 'TRUE';
    if (search) {
      params.push(`%${search}%`);
      where = `(al.action ILIKE $1 OR u.name ILIKE $1)`;
    }
    const from = `FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE ${where}`;
    const [count, data] = await Promise.all([
      db.query(`SELECT COUNT(*) ${from}`, params),
      db.query(`SELECT al.*, u.name AS user_name, u.email AS user_email ${from}
                ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]),
    ]);
    return { rows: data.rows, total: Number(count.rows[0].count) };
  },

  /** "Last N days" = from N days ago up to now; future bookings are not counted (decision 2026-10-20). */
  analytics: async (days, scopes = null) => {
    const params = [days];
    const inScope = scopeSql(scopes, { person: 'u', room: 'r' }, params);
    const roomsInScope = scopeSql(scopes, { room: 'r' }, params);
    // ACTIVE bookings of the last N days that the admin may see.
    const recent = `
      SELECT b.* FROM bookings b JOIN rooms r ON r.id = b.room_id JOIN users u ON u.id = b.created_by
       WHERE b.status = 'ACTIVE' AND b.start_time >= NOW() - INTERVAL '1 day' * $1 AND b.start_time <= NOW() AND ${inScope}`;
    const [summary, topRooms, peakHours, dailyTrends] = await Promise.all([
      db.query(`
        WITH stats AS (
          SELECT (SELECT COUNT(*) FROM (${recent}) x) AS booking_count,
                 (SELECT COUNT(*) FROM rooms r WHERE r.is_active AND ${roomsInScope}) AS room_count
        )
        SELECT booking_count, room_count,
               (booking_count::float / NULLIF(room_count * 12 * $1, 0)) * 100 AS utilization_percent
          FROM stats`, params),
      db.query(`
        SELECT r.name, COUNT(b.id) AS booking_count
          FROM rooms r LEFT JOIN (${recent}) b ON b.room_id = r.id
         WHERE ${roomsInScope}
         GROUP BY r.id, r.name ORDER BY booking_count DESC LIMIT 5`, params),
      db.query(`
        SELECT EXTRACT(HOUR FROM start_time AT TIME ZONE 'Asia/Kolkata') AS hour, COUNT(*) AS count
          FROM (${recent}) b GROUP BY hour ORDER BY hour ASC`, params),
      db.query(`
        SELECT (start_time AT TIME ZONE 'Asia/Kolkata')::date AS date, COUNT(*) AS count
          FROM (${recent}) b GROUP BY date ORDER BY date ASC`, params),
    ]);
    return { summary: summary.rows[0], topRooms: topRooms.rows, peakHours: peakHours.rows, dailyTrends: dailyTrends.rows };
  },
};

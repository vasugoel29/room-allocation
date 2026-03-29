import * as db from '../db.js';
import { Transform } from 'stream';

/**
 * Controller for Admin specific operations
 */

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
    if (start_date) { params.push(start_date); query += ` AND b.start_time >= $${params.length}`; }
    if (end_date) { params.push(end_date); query += ` AND b.end_time <= $${params.length}`; }
    query += " ORDER BY b.start_time DESC";

    const client = await db.pool.connect();
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=bookings_export_${new Date().toISOString()}.csv`);

    // CSV Header
    res.write('ID,Room,Start Time,End Time,User,Purpose,Status\n');

    const cursor = await client.query(query, params);
    
    cursor.rows.forEach(row => {
      const csvRow = [
        row.id,
        row.room_name,
        row.start_time,
        row.end_time,
        `"${row.user_name.replace(/"/g, '""')}"`,
        `"${(row.purpose || '').replace(/"/g, '""')}"`,
        row.status
      ].join(',');
      res.write(csvRow + '\n');
    });

    res.end();
    client.release();
  } catch (err) {
    console.error('CSV Export failed', err);
    res.status(500).json({ error: 'Failed to export CSV' });
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

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=promotions_export_${new Date().toISOString()}.csv`);

    res.write('ID,User,Email,Requested Role,Status,Created At\n');

    result.rows.forEach(row => {
      const csvRow = [
        row.id,
        `"${row.user_name.replace(/"/g, '""')}"`,
        row.email,
        row.requested_role,
        row.status,
        row.created_at
      ].join(',');
      res.write(csvRow + '\n');
    });

    res.end();
  } catch (err) {
    console.error('Promotions CSV Export failed', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
};

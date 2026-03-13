import * as db from '../db.js';
import cache from '../utils/cache.js';

export const getRooms = async (req, res) => {
  const { capacity, ac, projector } = req.query;
  let query = 'SELECT * FROM rooms WHERE 1=1';
  const params = [];

  if (capacity) { params.push(capacity); query += ` AND capacity >= $${params.length}`; }
  if (ac === 'true') query += ' AND has_ac = TRUE';
  if (projector === 'true') query += ' AND has_projector = TRUE';

  try {
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

export const getAvailability = async (req, res) => {
  try {
    const cacheKey = 'room_availability_all';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.query('SELECT * FROM room_availability');
    cache.set(cacheKey, result.rows, 300000); // 5 min for static schedule
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

export const getAdminRoomStatus = async (req, res) => {
  const { date, slot } = req.query;
  if (!date || slot === undefined) {
    return res.status(400).json({ error: 'Missing date or slot' });
  }

  try {
    const cacheKey = `admin_status_${date}_${slot}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const startTime = new Date(date);
    startTime.setHours(parseInt(slot), 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    const query = `
      SELECT 
        r.id as room_id, 
        r.name as room_name,
        r.building,
        r.floor,
        b.id as booking_id,
        b.purpose,
        u.name as booked_by_name,
        u.email as booked_by_email
      FROM rooms r
      LEFT JOIN bookings b ON r.id = b.room_id 
        AND b.status = 'ACTIVE'
        AND tstzrange(b.start_time, b.end_time) && tstzrange($1::timestamptz, $2::timestamptz)
      LEFT JOIN users u ON b.created_by = u.id
      ORDER BY r.name ASC
    `;
    
    const result = await db.query(query, [startTime.toISOString(), endTime.toISOString()]);
    cache.set(cacheKey, result.rows, 30000); // 30s cache
    res.json(result.rows);
  } catch (err) {
    console.error('getAdminRoomStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch room statuses' });
  }
};

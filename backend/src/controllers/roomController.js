import * as db from '../db.js';

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
    const result = await db.query('SELECT * FROM room_availability');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

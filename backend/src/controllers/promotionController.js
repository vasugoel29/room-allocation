import * as db from '../db.js';
import logger from '../utils/logger.js';

export const requestPromotion = async (req, res) => {
  const { reason } = req.body;
  const userId = req.user.id;

  try {
    const result = await db.query(
      'INSERT INTO promotion_requests (user_id, reason) VALUES ($1, $2) RETURNING *',
      [userId, reason]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You already have a pending promotion request' });
    }
    logger.error('Promotion request failed', err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
};

export const getPromotionRequests = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT pr.*, u.name as user_name, u.email as user_email 
      FROM promotion_requests pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

export const handlePromotionAction = async (req, res) => {
  const { id } = req.params;
  const { status, admin_comment } = req.body; // status: APPROVED, REJECTED

  try {
    await db.query('BEGIN');
    
    const requestRes = await db.query('SELECT * FROM promotion_requests WHERE id = $1', [id]);
    const request = requestRes.rows[0];

    if (!request) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }

    await db.query(
      'UPDATE promotion_requests SET status = $1, admin_comment = $2, updated_at = NOW() WHERE id = $3',
      [status, admin_comment, id]
    );

    if (status === 'APPROVED') {
      await db.query(
        "UPDATE users SET role = 'STUDENT_REP' WHERE id = $1",
        [request.user_id]
      );
    }

    await db.query('COMMIT');
    res.json({ message: `Request ${status.toLowerCase()} successfully` });
  } catch (err) {
    await db.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to process request' });
  }
};

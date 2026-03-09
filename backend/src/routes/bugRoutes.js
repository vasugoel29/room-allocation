import express from 'express';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import * as db from '../db.js';

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  const { title, description, severity } = req.body;
  const userId = req.user.id;

  try {
    // Persist bug report to database
    const result = await db.query(
      'INSERT INTO bugs (user_id, title, description, severity) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, title, description, severity]
    );

    logger.warn('BUG REPORT PERSISTED', { 
      bug_id: result.rows[0].id,
      user_id: userId, 
      user_email: req.user.email,
      title, 
      severity 
    });

    res.status(201).json({ 
      status: 'Success', 
      message: 'Bug report received and persisted.',
      bugId: result.rows[0].id
    });
  } catch (err) {
    console.error('Failed to persist bug report:', err);
    res.status(500).json({ error: 'Failed to submit bug report' });
  }
});

export default router;

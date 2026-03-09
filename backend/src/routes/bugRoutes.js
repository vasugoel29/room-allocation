import express from 'express';
import { authenticate } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  const { title, description, severity } = req.body;
  const userId = req.user.id;

  try {
    // Log the bug report for manual review
    logger.warn('BUG REPORT SUBMITTED', { 
      user_id: userId, 
      user_email: req.user.email,
      title, 
      severity 
    });

    // In a real app, we might store this in a 'bugs' table
    // For now, we'll just log it and acknowledge success
    res.status(201).json({ 
      status: 'Success', 
      message: 'Bug report received and logged.' 
    });
  } catch (err) {
    console.error('Failed to process bug report:', err);
    res.status(500).json({ error: 'Failed to submit bug report' });
  }
});

export default router;

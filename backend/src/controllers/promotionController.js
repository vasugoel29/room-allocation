import * as db from '../db.js';
import logger from '../utils/logger.js';
import { promotionRepository } from '../repositories/promotionRepository.js';
import { userRepository } from '../repositories/userRepository.js';

export const requestPromotion = async (req, res) => {
  const { reason } = req.body;
  const userId = req.user.id;

  try {
    const request = await promotionRepository.createRequest(userId, reason);
    res.status(201).json(request);
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
    const requests = await promotionRepository.findAllRequests();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

export const handlePromotionAction = async (req, res) => {
  const { id } = req.params;
  const { status, admin_comment } = req.body; // status: APPROVED, REJECTED

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    
    const request = await promotionRepository.findById(id, client);

    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }

    await promotionRepository.updateStatus(id, status, admin_comment, client);

    if (status === 'APPROVED') {
      await userRepository.updateRole(request.user_id, 'STUDENT_REP', client);
    }

    await client.query('COMMIT');
    res.json({ message: `Request ${status.toLowerCase()} successfully` });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Promotion action failed', err);
    res.status(500).json({ error: 'Failed to process request' });
  } finally {
    client.release();
  }
};

export const getMyPromotionRequest = async (req, res) => {
  try {
    const request = await promotionRepository.findByUserId(req.user.id);
    res.json(request || null);
  } catch (err) {
    logger.error('Failed to fetch user promotion request', err);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
};


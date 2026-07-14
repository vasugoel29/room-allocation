import * as db from '../db.js';
import logger from '../utils/logger.js';
import { promotionRepository } from '../repositories/promotionRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { notifyPromotionResult } from '../utils/emailService.js';
import { logActivity } from '../services/loggerService.js';

export const requestPromotion = async (req, res) => {
  const { reason } = req.body;
  const userId = req.user.id;

  if (!reason || reason.trim().length > 100) {
    return res.status(400).json({ error: 'Reason is required and must be under 100 characters' });
  }

  try {
    const request = await promotionRepository.createRequest(userId, reason);

    await logActivity({
      userId,
      action: 'REQUEST_PROMOTION',
      entityType: 'promotion',
      entityId: request.id,
      details: { reason }
    });

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
  const { page, limit } = req.query;
  try {
    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const offset = (pageNum - 1) * limitNum;
      const { total, requests } = await promotionRepository.findAllRequestsPaginated(limitNum, offset);
      res.json({
        data: requests,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } else {
      const requests = await promotionRepository.findAllRequests();
      res.json(requests);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

export const handlePromotionAction = async (req, res) => {
  const { id } = req.params;
  const { status, admin_comment } = req.body; // status: APPROVED, REJECTED

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (admin_comment && admin_comment.length > 100) {
    return res.status(400).json({ error: 'Admin comment must be under 100 characters' });
  }

  const result = await db.runInTransaction(async (client) => {
    const request = await promotionRepository.findById(id, client);

    if (!request) {
      throw { error: 'Request not found', status: 404 };
    }

    await promotionRepository.updateStatus(id, status, admin_comment, client);

    if (status === 'APPROVED') {
      await userRepository.updateRole(request.user_id, 'STUDENT_REP', client);
    }

    await logActivity({
      userId: req.user.id, // Admin
      action: status === 'APPROVED' ? 'APPROVE_PROMOTION' : 'REJECT_PROMOTION',
      entityType: 'promotion',
      entityId: id,
      details: { user_id: request.user_id, admin_comment }
    }, client);

    return { request };
  }).catch(err => {
    if (err && err.error) return err;
    throw err;
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  // PROD-02: Notify student of promotion result
  try {
    const user = await userRepository.findById(result.request.user_id);
    if (user?.email) {
      notifyPromotionResult({
        userEmail: user.email,
        userName: user.name,
        status,
        adminComment: admin_comment
      }).catch(err => logger.error('Promotion notification failed', err));
    }
  } catch (notifErr) {
    logger.error('Failed to send promotion notification (non-blocking)', notifErr);
  }

  res.json({ message: `Request ${status.toLowerCase()} successfully` });
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


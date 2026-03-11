import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { 
  requestPromotion, 
  getPromotionRequests, 
  handlePromotionAction 
} from '../controllers/promotionController.js';

const router = express.Router();

router.post('/', authenticate, requestPromotion);
router.get('/', authenticate, requireRole('admin'), getPromotionRequests);
router.patch('/:id', authenticate, requireRole('admin'), handlePromotionAction);

export default router;

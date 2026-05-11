import express from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { 
  requestPromotion, 
  getPromotionRequests, 
  handlePromotionAction,
  getMyPromotionRequest
} from '../controllers/promotionController.js';


const router = express.Router();

router.post('/', authenticate, requestPromotion);
router.get('/me', authenticate, getMyPromotionRequest);
router.get('/', authenticate, requireRole('ADMIN'), getPromotionRequests);
router.patch('/:id', authenticate, requireRole('ADMIN'), handlePromotionAction);


export default router;

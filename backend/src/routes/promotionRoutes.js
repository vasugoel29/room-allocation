import express from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS as P } from '../auth/permissions.js';
import { 
  requestPromotion, 
  getPromotionRequests, 
  handlePromotionAction,
  getMyPromotionRequest
} from '../controllers/promotionController.js';


const router = express.Router();

router.post('/', authenticate, requestPromotion);
router.get('/me', authenticate, getMyPromotionRequest);
router.get('/', authenticate, requirePermission(P.PROMOTIONS_MANAGE), getPromotionRequests);
router.patch('/:id', authenticate, requirePermission(P.PROMOTIONS_MANAGE), handlePromotionAction);


export default router;

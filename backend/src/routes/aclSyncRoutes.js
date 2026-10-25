import express from 'express';
import { requireInternalToken, syncFaculties } from '../controllers/internalController.js';
import { authIpLimiter } from '../middleware/leakyBucket.js';

// Service-to-service API for the central ACL. Mounted before the browser JSON parser and audit
// middleware: it has its own body limit and writes its own summarised audit entry.
const router = express.Router();

router.put('/faculties', authIpLimiter, requireInternalToken, express.json({ limit: '2mb' }), syncFaculties);

export default router;

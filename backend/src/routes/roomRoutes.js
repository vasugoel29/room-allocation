import express from 'express';
import { getRooms, getAvailability } from '../controllers/roomController.js';

const router = express.Router();

router.get('/rooms', getRooms);
router.get('/availability', getAvailability);

export default router;

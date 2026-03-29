import * as db from '../db.js';
import cache from '../utils/cache.js';
import { roomRepository } from '../repositories/roomRepository.js';

export const getRooms = async (req, res) => {
  const { capacity, ac, projector, building } = req.query;
  try {
    const rooms = await roomRepository.findFiltered(capacity, ac, projector, building);
    res.json(rooms);
  } catch (err) {
    console.error('getRooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

export const getAvailability = async (req, res) => {
  try {
    const cacheKey = 'room_availability_all';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const result = await roomRepository.getAllAvailability();
    cache.set(cacheKey, result, 300000); // 5 min
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

export const getAdminRoomStatus = async (req, res) => {
  const { date, slot } = req.query;
  if (!date || slot === undefined) {
    return res.status(400).json({ error: 'Missing date or slot' });
  }

  try {
    const cacheKey = `admin_status_${date}_${slot}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const startTime = new Date(date);
    startTime.setHours(parseInt(slot), 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 1);

    const statuses = await roomRepository.getAdminRoomStatus(startTime.toISOString(), endTime.toISOString());
    
    cache.set(cacheKey, statuses, 30000); // 30s cache
    res.json(statuses);
  } catch (err) {
    console.error('getAdminRoomStatus error:', err);
    res.status(500).json({ error: 'Failed to fetch room statuses' });
  }
};
export const overrideRoomAvailability = async (req, res) => {
  const { room_name, day, hour, is_available } = req.body;
  if (!room_name || !day || hour === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const userId = req.user?.id; // Capture who is making the override
    await roomRepository.overrideAvailability(room_name, day, hour, is_available, userId);
    
    cache.delete('room_availability_all');
    res.json({ status: 'Success', message: `Room ${room_name} availability updated` });
  } catch (err) {
    console.error('overrideRoomAvailability error:', err);
    res.status(500).json({ error: err.message || 'Failed to update availability' });
  }
};

export const getMyOverrides = async (req, res) => {
  try {
    const overrides = await roomRepository.getUserOverrides(req.user.id);
    res.json(overrides);
  } catch (err) {
    console.error('getMyOverrides error:', err);
    res.status(500).json({ error: 'Failed to fetch your overrides' });
  }
};

import * as db from '../db.js';
import cache from '../utils/cache.js';
import { roomRepository } from '../repositories/roomRepository.js';
import logger from '../utils/logger.js';

export const getRooms = async (req, res) => {
  const { capacity, ac, projector, building, floor, type, page, limit } = req.query;
  try {
    const isStudent = req.user?.role !== 'ADMIN' && req.user?.role !== 'FACULTY';
    
    if (page && limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const offset = (pageNum - 1) * limitNum;
      
      let { total, rooms } = await roomRepository.findFilteredPaginated({
        capacity, ac, projector, building, floor, type, limit: limitNum, offset
      });
      
      if (isStudent) {
        rooms = rooms.filter(r => r.type !== 'Committee Room' && r.type !== 'Auditorium');
      }
      
      res.json({
        data: rooms,
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } else {
      let rooms = await roomRepository.findFiltered(capacity, ac, projector, building, floor, type);
      if (isStudent) {
        rooms = rooms.filter(r => r.type !== 'Committee Room' && r.type !== 'Auditorium');
      }
      res.json(rooms);
    }
  } catch (err) {
    logger.error('getRooms error', err);
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
    logger.error('getAvailability error', err);
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
    logger.error('getAdminRoomStatus error', err);
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
    logger.error('overrideRoomAvailability error', err);
    res.status(500).json({ error: err.message || 'Failed to update availability' });
  }
};

export const getMyOverrides = async (req, res) => {
  try {
    const overrides = await roomRepository.getUserOverrides(req.user.id);
    res.json(overrides);
  } catch (err) {
    logger.error('getMyOverrides error', err);
    res.status(500).json({ error: 'Failed to fetch your overrides' });
  }
};

export const createRoom = async (req, res) => {
  const { name, building, floor, capacity, type, has_ac, has_projector } = req.body;
  if (!name || capacity === undefined) {
    return res.status(400).json({ error: 'Missing name or capacity' });
  }

  try {
    const room = await roomRepository.create({
      name,
      building,
      floor: floor !== undefined && floor !== null ? parseInt(floor) : null,
      capacity: parseInt(capacity),
      type,
      has_ac: !!has_ac,
      has_projector: !!has_projector
    });
    cache.delete('room_availability_all');
    res.status(201).json(room);
  } catch (err) {
    logger.error('createRoom error', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

export const updateRoom = async (req, res) => {
  const { id } = req.params;
  const { name, building, floor, capacity, type, has_ac, has_projector } = req.body;

  try {
    const room = await roomRepository.update(id, {
      name,
      building,
      floor: floor !== undefined && floor !== null ? parseInt(floor) : null,
      capacity: parseInt(capacity),
      type,
      has_ac: !!has_ac,
      has_projector: !!has_projector
    });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    cache.delete('room_availability_all');
    res.json(room);
  } catch (err) {
    logger.error('updateRoom error', err);
    res.status(500).json({ error: 'Failed to update room' });
  }
};

export const deleteRoom = async (req, res) => {
  const { id } = req.params;
  try {
    const room = await roomRepository.delete(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    cache.delete('room_availability_all');
    res.json({ status: 'Success', message: `Room ${room.name} deleted successfully` });
  } catch (err) {
    logger.error('deleteRoom error', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

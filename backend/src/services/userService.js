import { invalidateRoomCaches } from '../utils/cache.js';
import * as db from '../db.js';
import { invalidatePrincipal } from '../auth/session.js';
import { userRepository } from '../repositories/userRepository.js';

export const getUsers = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const offset = (page - 1) * limit;
  const search = filters.search || '';
  const role = filters.role || '';

  const [users, total] = await Promise.all([
    userRepository.findAll(limit, offset, search, role, filters.scopes ?? null),
    userRepository.countUsers(search, role, filters.scopes ?? null)
  ]);

  return {
    data: users,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

export const findById = async (id) => {
  return userRepository.findById(id);
};

export const deleteUser = async (id) => {
  const user = await db.runInTransaction((client) => userRepository.delete(id, client));
  if (user) {
    invalidatePrincipal(user.id);
    // Their upcoming bookings were cancelled, so cached room status/availability is stale.
    invalidateRoomCaches();
  }
  return user;
};

export const getFaculties = async () => {
  return userRepository.findFaculties();
};

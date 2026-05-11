import { userRepository } from '../repositories/userRepository.js';

export const getUsers = async (filters = {}) => {
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 20;
  const offset = (page - 1) * limit;

  const [users, total] = await Promise.all([
    userRepository.findAll(limit, offset),
    userRepository.countUsers()
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

export const findByEmail = async (email) => {
  return userRepository.findByEmail(email);
};

export const findById = async (id) => {
  return userRepository.findById(id);
};

export const createUser = async (userData) => {
  return userRepository.create(userData);
};

export const updateUser = async (id, userData) => {
  return userRepository.update(id, userData);
};

export const deleteUser = async (id) => {
  return userRepository.delete(id);
};

export const getFaculties = async () => {
  return userRepository.findFaculties();
};

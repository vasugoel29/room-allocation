import { userRepository } from '../repositories/userRepository.js';

export const getUsers = async () => {
  return userRepository.findAll();
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

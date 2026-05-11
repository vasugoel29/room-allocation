import { departmentRepository } from '../repositories/departmentRepository.js';

export const getDepartments = async () => {
  return departmentRepository.findAll();
};

export const createDepartment = async (name) => {
  return departmentRepository.upsert(name);
};

export const ensureDepartment = async (name) => {
  if (!name) return null;
  const dept = await departmentRepository.upsert(name);
  return dept.id;
};

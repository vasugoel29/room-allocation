import { departmentRepository } from '../repositories/departmentRepository.js';

export const getDepartments = async (filters = {}) => {
  const page = parseInt(filters.page);
  const limit = parseInt(filters.limit);
  
  if (page && limit) {
    const offset = (page - 1) * limit;
    const { total, departments } = await departmentRepository.findAllPaginated(limit, offset);
    return {
      data: departments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
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

export const updateDepartment = async (id, name) => {
  return departmentRepository.update(id, name);
};

export const deleteDepartment = async (id) => {
  return departmentRepository.delete(id);
};

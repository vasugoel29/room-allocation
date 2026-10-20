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

import { branchRepository } from '../repositories/branchRepository.js';

export const getBranches = async (filters = {}) => {
  const page = Number.parseInt(filters.page, 10);
  const limit = Number.parseInt(filters.limit, 10);
  if (!page || !limit) return branchRepository.findAll();

  const { total, branches } = await branchRepository.findAllPaginated(limit, (page - 1) * limit);
  return {
    data: branches,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
};

export const createBranch = (branch) => branchRepository.create(branch);
export const updateBranch = (id, branch) => branchRepository.update(id, branch);
export const deleteBranch = (id) => branchRepository.delete(id);

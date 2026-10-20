import api, { readJson } from '../utils/api';

export const facultyService = {
  getPendingRequests: async () => {
    const res = await api.get('/faculty/pending');
    return readJson(res, 'Failed to fetch pending requests');
  },

  handleRequest: async (id, action) => {
    const res = await api.patch(`/faculty/${id}/${action}`);
    return readJson(res, `Failed to ${action} request`);
  }
};

export default facultyService;

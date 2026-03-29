import api from '../utils/api';

export const facultyService = {
  getPendingRequests: async () => {
    const res = await api.get('/faculty/pending');
    if (!res.ok) throw new Error('Failed to fetch pending requests');
    return res.json();
  },

  handleRequest: async (id, action) => {
    const res = await api.patch(`/faculty/${id}/${action}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `Failed to ${action} request`);
    }
    return res.json();
  }
};

export default facultyService;

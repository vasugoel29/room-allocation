import api from '../utils/api';

export const roomService = {
  getRooms: async (filters = {}) => {
    const query = new URLSearchParams(filters).toString();
    const res = await api.get(`/rooms?${query}`);
    if (!res.ok) throw new Error('Failed to fetch rooms');
    return res.json();
  },

  getAvailability: async () => {
    const res = await api.get('/availability');
    if (!res.ok) throw new Error('Failed to fetch availability');
    return res.json();
  },

  getHealth: async () => {
    const res = await api.get('/health');
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },

  createAvailabilityOverride: async (data) => {
    const res = await api.post('/availability/override', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Override creation failed');
    }
    return res.json();
  },

  getDepartments: async () => {
    const res = await api.get('/departments');
    if (!res.ok) throw new Error('Failed to fetch departments');
    return res.json();
  },

  getMyAvailability: async () => {
    const res = await api.get('/availability/my');
    if (!res.ok) throw new Error('Failed to fetch your cancellations');
    return res.json();
  }
};

export default roomService;

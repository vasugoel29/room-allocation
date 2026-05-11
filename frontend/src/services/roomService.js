import api from '../utils/api';

export const roomService = {
  getRooms: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(val => params.append(key, val));
      } else if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const res = await api.get(`/rooms?${params.toString()}`);
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
  },

  getTimetable: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(val => params.append(key, val));
      } else if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const res = await api.get(`/timetable?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch timetable');
    return res.json();
  },

  getFacultyTimetable: async () => {
    const res = await api.get('/timetable/faculty');
    if (!res.ok) throw new Error('Failed to fetch faculty timetable');
    return res.json();
  },

  checkFacultyAvailability: async (id, date, hour) => {
    const res = await api.get(`/timetable/faculty/check/${id}?date=${date}&hour=${hour}`);
    if (!res.ok) throw new Error('Failed to check faculty availability');
    return res.json();
  },

  overrideFacultySlot: async (data) => {
    const res = await api.post('/timetable/faculty/override', data);
    if (!res.ok) throw new Error('Failed to override faculty slot');
    return res.json();
  },

  getFacultyOverrides: async () => {
    const res = await api.get('/timetable/faculty/overrides');
    if (!res.ok) throw new Error('Failed to fetch faculty overrides');
    return res.json();
  }
};

export default roomService;

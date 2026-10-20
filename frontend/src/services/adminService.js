import api, { readJson } from '../utils/api';

/**
 * Service for Admin specific API calls
 */
export const adminService = {
  getAdminData: async (startDate, endDate, page = 1, limit = 20) => {
    const res = await api.get(`/bookings/admin/all?start_date=${startDate}&end_date=${endDate}&page=${page}&limit=${limit}`);
    const result = await readJson(res, 'Failed to fetch admin data');
    return {
      bookings: result.data || result,
      bookingsMeta: result.meta || null,
    };
  },

  getUsers: async (page = 1, limit = 20, search = '', role = '') => {
    const res = await api.get(`/auth/users?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}`);
    return readJson(res, 'Failed to fetch users');
  },

  getRoomStatuses: async (date, slot) => {
    const res = await api.get(`/rooms/admin/status?date=${date}&slot=${slot}`);
    return readJson(res, 'Failed to fetch room statuses');
  },

  /** Soft delete: the person can no longer sign in and their upcoming bookings are cancelled. */
  deactivateUser: async (id) => {
    const res = await api.delete(`/auth/users/${id}`);
    return readJson(res, 'Deactivation failed');
  },

  quickBook: async (data) => {
    const res = await api.post('/bookings/admin/quick', data);
    return readJson(res, 'Quick booking failed');
  },

  exportCSV: async (type, params = {}) => {
    let endpoint = `/admin/export/${type}`;
    const queryParams = new URLSearchParams(params).toString();
    if (queryParams) endpoint += `?${queryParams}`;

    const res = await api.get(endpoint);
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  fetchAuditLogs: async (page = 1, search = '') => {
    const res = await api.get(`/admin/audit-logs?page=${encodeURIComponent(page)}&search=${encodeURIComponent(search)}`); // NEW-FE-2
    return readJson(res, 'Failed to fetch audit logs');
  },

  fetchAnalytics: async (days = 30) => {
    const res = await api.get(`/admin/analytics?days=${days}`);
    return readJson(res, 'Failed to fetch analytics');
  },

  downloadTemplate: async (type) => {
    const res = await api.get(`/admin/uploads/template/${type}`);
    if (!res.ok) throw new Error('Template download failed');
    return res.blob();
  },

  exportXLSX: async (type, view) => {
    const query = view ? `?view=${encodeURIComponent(view)}` : '';
    const res = await api.get(`/admin/uploads/export/${type}${query}`);
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },

  importCSV: async (type, csvContent) => {
    const res = await api.post(`/admin/uploads/import/${type}`, { csvContent });
    return readJson(res, 'Import failed');
  },

  createRoom: async (data) => {
    const res = await api.post('/rooms', data);
    return readJson(res, 'Failed to create room');
  },

  updateRoom: async (id, data) => {
    const res = await api.patch(`/rooms/${id}`, data);
    return readJson(res, 'Failed to update room');
  },

  deleteRoom: async (id) => {
    const res = await api.delete(`/rooms/${id}`);
    return readJson(res, 'Failed to delete room');
  },



  // Async upload job polling
  pollJobStatus: async (jobId) => {
    const res = await api.get(`/admin/uploads/status/${jobId}`);
    if (!res.ok) {
      if (res.status === 404) return { status: 'not_found' };
      throw new Error('Failed to poll job status');
    }
    return res.json();
  },

  // Timetable slot CRUD
  listTimetableSlots: async ({ faculty_name, day_of_week, semester, page = 1, limit = 50 } = {}) => {
    const params = new URLSearchParams();
    if (faculty_name) params.append('faculty_name', faculty_name);
    if (day_of_week) params.append('day_of_week', day_of_week);
    if (semester) params.append('semester', semester);
    params.append('page', page);
    params.append('limit', limit);
    const res = await api.get(`/timetable/slots?${params.toString()}`);
    return readJson(res, 'Failed to fetch timetable slots');
  },

  createTimetableSlot: async (data) => {
    const res = await api.post('/timetable/slots', data);
    return readJson(res, 'Failed to create slot');
  },

  updateTimetableSlot: async (id, data) => {
    const res = await api.patch(`/timetable/slots/${id}`, data);
    return readJson(res, 'Failed to update slot');
  },

  deleteTimetableSlot: async (id) => {
    const res = await api.delete(`/timetable/slots/${id}`);
    return readJson(res, 'Failed to delete slot');
  }
};

export default adminService;

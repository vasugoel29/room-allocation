import api from '../utils/api';

/**
 * Service for Admin specific API calls
 */
export const adminService = {
  getAdminData: async (startDate, endDate, page = 1, limit = 20) => {
    const [bookingsRes, promotionsRes] = await Promise.all([
      api.get(`/bookings/admin/all?start_date=${startDate}&end_date=${endDate}&page=${page}&limit=${limit}`),
      api.get('/promotions')
    ]);
    
    if (!bookingsRes.ok || !promotionsRes.ok) throw new Error('Failed to fetch admin data');
    
    const bookingsResult = await bookingsRes.json();
    const promotionsResult = await promotionsRes.json();
    
    return {
      bookings: bookingsResult.data || bookingsResult,
      bookingsMeta: bookingsResult.meta || null,
      promotions: promotionsResult.data || promotionsResult
    };
  },

  getPromotions: async (page = 1, limit = 10) => {
    const res = await api.get(`/promotions?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch promotion requests');
    return res.json();
  },

  getUsers: async (page = 1, limit = 20) => {
    const res = await api.get(`/auth/users?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  createUser: async (data) => {
    const res = await api.post('/auth/users', data);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'User creation failed');
    }
    return res.json();
  },

  updateUser: async (id, data) => {
    const res = await api.patch(`/auth/users/${id}`, data);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'User update failed');
    }
    return res.json();
  },

  getRoomStatuses: async (date, slot) => {
    const res = await api.get(`/rooms/admin/status?date=${date}&slot=${slot}`);
    if (!res.ok) throw new Error('Failed to fetch room statuses');
    return res.json();
  },

  getDepartments: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const res = await api.get(`/departments?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch departments');
    return res.json();
  },

  getBranches: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) params.append(key, value);
    });
    const res = await api.get(`/branches?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch branches');
    return res.json();
  },

  approveUser: async (id) => {
    const res = await api.patch(`/auth/approve-user/${id}`);
    if (!res.ok) throw new Error('Approval failed');
    return res.json();
  },

  deleteUser: async (id) => {
    const res = await api.delete(`/auth/users/${id}`);
    if (!res.ok) throw new Error('Deletion failed');
    return res.json();
  },

  quickBook: async (data) => {
    const res = await api.post('/bookings/admin/quick', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Quick booking failed');
    }
    return res.json();
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
    const res = await api.get(`/admin/audit-logs?page=${page}&search=${search}`);
    if (!res.ok) throw new Error('Failed to fetch audit logs');
    return res.json();
  },

  fetchAnalytics: async (days = 30) => {
    const res = await api.get(`/admin/analytics?days=${days}`);
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
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
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Import failed');
    }
    return res.json();
  },

  createRoom: async (data) => {
    const res = await api.post('/rooms', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create room');
    }
    return res.json();
  },

  updateRoom: async (id, data) => {
    const res = await api.patch(`/rooms/${id}`, data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update room');
    }
    return res.json();
  },

  deleteRoom: async (id) => {
    const res = await api.delete(`/rooms/${id}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete room');
    }
    return res.json();
  },

  createDepartment: async (name) => {
    const res = await api.post('/departments', { name });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create department');
    }
    return res.json();
  },

  updateDepartment: async (id, name) => {
    const res = await api.patch(`/departments/${id}`, { name });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update department');
    }
    return res.json();
  },

  deleteDepartment: async (id) => {
    const res = await api.delete(`/departments/${id}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete department');
    }
    return res.json();
  },

  createBranch: async (data) => {
    const res = await api.post('/branches', data);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to create branch');
    return res.json();
  },

  updateBranch: async (id, data) => {
    const res = await api.patch(`/branches/${id}`, data);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to update branch');
    return res.json();
  },

  deleteBranch: async (id) => {
    const res = await api.delete(`/branches/${id}`);
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete branch');
    return res.json();
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
    if (!res.ok) throw new Error('Failed to fetch timetable slots');
    return res.json();
  },

  createTimetableSlot: async (data) => {
    const res = await api.post('/timetable/slots', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create slot');
    }
    return res.json();
  },

  updateTimetableSlot: async (id, data) => {
    const res = await api.patch(`/timetable/slots/${id}`, data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to update slot');
    }
    return res.json();
  },

  deleteTimetableSlot: async (id) => {
    const res = await api.delete(`/timetable/slots/${id}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to delete slot');
    }
    return res.json();
  }
};

export default adminService;

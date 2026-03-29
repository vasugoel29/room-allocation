import api from '../utils/api';

/**
 * Service for Admin specific API calls
 */
export const adminService = {
  getAdminData: async (startDate, endDate) => {
    const [bookingsRes, promotionsRes] = await Promise.all([
      api.get(`/bookings/admin/all?start_date=${startDate}&end_date=${endDate}`),
      api.get('/promotions')
    ]);
    
    if (!bookingsRes.ok || !promotionsRes.ok) throw new Error('Failed to fetch admin data');
    
    return {
      bookings: await bookingsRes.json(),
      promotions: await promotionsRes.json()
    };
  },

  getUsers: async () => {
    const res = await api.get('/auth/users');
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

  getDepartments: async () => {
    const res = await api.get('/departments');
    if (!res.ok) throw new Error('Failed to fetch departments');
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
  }
};

export default adminService;

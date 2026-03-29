import api from '../utils/api';

export const authService = {
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Login failed');
    }
    return res.json();
  },

  signup: async (data) => {
    const res = await api.post('/auth/signup', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Signup failed');
    }
    return res.json();
  },

  logout: async () => {
    return api.post('/auth/logout');
  },

  getFaculties: async () => {
    const res = await api.get('/auth/faculties');
    if (!res.ok) throw new Error('Failed to fetch faculties');
    return res.json();
  },

  updateUser: async (id, data) => {
    const res = await api.patch(`/auth/users/${id}`, data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Update failed');
    }
    return res.json();
  },

  createUser: async (data) => {
    const res = await api.post('/auth/users', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Creation failed');
    }
    return res.json();
  }
};

export default authService;

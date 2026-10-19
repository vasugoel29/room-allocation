import api from '../utils/api';

export const authService = {
  googleLogin: async (credential) => {
    const res = await api.post('/auth/google', { credential });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Google sign-in failed');
    }
    return res.json();
  },

  /** Development only: the server enables this route only with AUTH_DEV_LOGIN=true. */
  devLogin: async (email) => {
    const res = await api.post('/auth/dev-login', { email });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Dev sign-in failed');
    }
    return res.json();
  },

  /** The current user's fresh role, permissions and profile. */
  me: async () => {
    const res = await api.get('/auth/me');
    if (!res.ok) throw new Error('Failed to load your profile');
    return (await res.json()).user;
  },

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

  getUsers: async (filters = {}) => {
    const queryParams = new URLSearchParams(filters).toString();
    const endpoint = `/auth/users${queryParams ? `?${queryParams}` : ''}`;
    const res = await api.get(endpoint);
    if (!res.ok) throw new Error('Failed to fetch users');
    const result = await res.json();
    return result.data || result;
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
  },

  forgotPassword: async (email) => {
    const res = await api.post('/auth/forgot-password', { email });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  resetPassword: async (token, password) => {
    const res = await api.post('/auth/reset-password', { token, password });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Reset failed');
    }
    return res.json();
  },

  verifyStudent: async (rollNo) => {
    const res = await api.get(`/auth/verify-student/${rollNo}`);
    if (!res.ok) {
      // Don't throw for 404, just return null so frontend can use fallback logic
      if (res.status === 404) return null;
      const err = await res.json();
      throw new Error(err.error || 'Verification failed');
    }
    return res.json();
  }
};

export default authService;

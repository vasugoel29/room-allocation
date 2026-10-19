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
};

export default authService;

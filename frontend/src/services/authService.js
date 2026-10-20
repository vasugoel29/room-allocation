import api, { readJson } from '../utils/api';

export const authService = {
  googleLogin: async (credential) => {
    const res = await api.post('/auth/google', { credential });
    return readJson(res, 'Google sign-in failed');
  },

  /** Development only: the server enables this route only with AUTH_DEV_LOGIN=true. */
  devLogin: async (email) => {
    const res = await api.post('/auth/dev-login', { email });
    return readJson(res, 'Dev sign-in failed');
  },

  /** The current user's fresh role, permissions and profile. */
  me: async () => {
    const res = await api.get('/auth/me');
    return (await readJson(res, 'Failed to load your profile')).user;
  },

  logout: async () => {
    return api.post('/auth/logout');
  },

  getUsers: async (filters = {}) => {
    const queryParams = new URLSearchParams(filters).toString();
    const endpoint = `/auth/users${queryParams ? `?${queryParams}` : ''}`;
    const res = await api.get(endpoint);
    const result = await readJson(res, 'Failed to fetch users');
    return result.data || result;
  },

  getFaculties: async () => {
    const res = await api.get('/auth/faculties');
    return readJson(res, 'Failed to fetch faculties');
  },
};

export default authService;

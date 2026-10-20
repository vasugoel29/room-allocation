import api, { readJson as json } from '../utils/api';

/** In-app inbox (Phase 7). */
export const notificationService = {
  list: async ({ limit = 20, before } = {}) =>
    json(await api.get(`/notifications?limit=${limit}${before ? `&before=${encodeURIComponent(before)}` : ''}`), 'Could not load notifications'),
  unreadCount: async () => (await json(await api.get('/notifications/unread-count'), 'Could not load notifications')).unread,
  markRead: async (id) => json(await api.patch(`/notifications/${id}/read`), 'Could not update the notification'),
  markAllRead: async () => json(await api.post('/notifications/read-all'), 'Could not update notifications'),
  dismiss: async (id) => json(await api.delete(`/notifications/${id}`), 'Could not dismiss the notification'),
};

import api from '../utils/api';

export const promotionService = {
  requestPromotion: async (reason) => {
    const res = await api.post('/promotions', { reason });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Promotion request failed');
    }
    return res.json();
  },

  handlePromotion: async (id, data) => {
    const res = await api.patch(`/promotions/${id}`, data);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Promotion action failed');
    }
    return res.json();
  },

  getMyRequest: async () => {
    const res = await api.get('/promotions/me');
    if (!res.ok) throw new Error('Failed to fetch your promotion request');
    return res.json();
  }
};


export default promotionService;

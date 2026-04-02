import api from '../utils/api';

/**
 * Service for Booking specific API calls
 */
export const bookingService = {
  getBookings: async (filters = {}) => {
    const queryParams = new URLSearchParams(filters).toString();
    const endpoint = `/bookings${queryParams ? `?${queryParams}` : ''}`;
    const res = await api.get(endpoint);
    if (!res.ok) throw new Error('Failed to fetch bookings');
    const result = await res.json();
    
    // For backward compatibility with other parts of the app that expect an array
    // We return the data array if it's paginated, otherwise return the array directly
    return result.data || result;
  },

  createBooking: async (data) => {
    const res = await api.post('/bookings', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Booking creation failed');
    }
    return res.json();
  },

  rescheduleBooking: async (id, data) => {
    const res = await api.post(`/bookings/${id}/reschedule`, data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Reschedule failed');
    }
    return res.json();
  },

  cancelBooking: async (id) => {
    const res = await api.patch(`/bookings/${id}/cancel`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Cancellation failed');
    }
    return res.json();
  },

  getIncomingTransfers: async () => {
    const res = await api.get('/transfers/incoming');
    if (!res.ok) throw new Error('Failed to fetch incoming transfers');
    return res.json();
  },

  getOutgoingTransfers: async () => {
    const res = await api.get('/transfers/outgoing');
    if (!res.ok) throw new Error('Failed to fetch outgoing transfers');
    return res.json();
  },

  requestTransfer: async (data) => {
    const res = await api.post('/transfers/request', data);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Transfer request failed');
    }
    return res.json();
  },

  handleTransferAction: async (id, action) => {
    const res = await api.patch(`/transfers/${id}/${action}`);
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} transfer`);
    }
    return res.json();
  }
};

export default bookingService;

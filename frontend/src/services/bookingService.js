import api, { readJson } from '../utils/api';

/**
 * Service for Booking specific API calls
 */
export const bookingService = {
  /** ACTIVE + PENDING bookings overlapping the IST days from..to (inclusive, at most 31 days). */
  getCalendar: async (from, to) => {
    const res = await api.get(`/bookings/calendar?${new URLSearchParams({ from, to })}`);
    return (await readJson(res, 'Failed to fetch the calendar')).data;
  },

  /** The signed-in user's own bookings and the ones they supervise, any status. */
  getMine: async () => {
    const res = await api.get('/bookings/mine');
    return (await readJson(res, 'Failed to fetch your bookings')).data;
  },

  createBooking: async (data) => {
    const res = await api.post('/bookings', data);
    return readJson(res, 'Booking creation failed'); // the error carries `conflict`
  },

  cancelBooking: async (id) => {
    const res = await api.patch(`/bookings/${id}/cancel`);
    return readJson(res, 'Cancellation failed');
  },

  getIncomingTransfers: async () => {
    const res = await api.get('/transfers/incoming');
    return readJson(res, 'Failed to fetch incoming transfers');
  },

  getOutgoingTransfers: async () => {
    const res = await api.get('/transfers/outgoing');
    return readJson(res, 'Failed to fetch outgoing transfers');
  },

  requestTransfer: async (data) => {
    const res = await api.post('/transfers/request', data);
    return readJson(res, 'Transfer request failed');
  },

  handleTransferAction: async (id, action) => {
    const res = await api.patch(`/transfers/${id}/${action}`);
    return readJson(res, `Failed to ${action} transfer`);
  }
};

export default bookingService;

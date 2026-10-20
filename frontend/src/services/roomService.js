import api, { readJson } from '../utils/api';

export const roomService = {
  getRooms: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(val => params.append(key, val));
      } else if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const res = await api.get(`/rooms?${params.toString()}`);
    return readJson(res, 'Failed to fetch rooms');
  },

  getAvailability: async () => {
    const res = await api.get('/availability');
    return readJson(res, 'Failed to fetch availability');
  },

  getHealth: async () => {
    const res = await api.get('/health');
    return readJson(res, 'Health check failed');
  },

  createAvailabilityOverride: async (data) => {
    const res = await api.post('/availability/override', data);
    return readJson(res, 'Override creation failed');
  },

  getMyAvailability: async () => {
    const res = await api.get('/availability/my');
    return readJson(res, 'Failed to fetch your cancellations');
  },

  getTimetable: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(val => params.append(key, val));
      } else if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
    const res = await api.get(`/timetable?${params.toString()}`);
    return readJson(res, 'Failed to fetch timetable');
  },

  getFacultyTimetable: async () => {
    const res = await api.get('/timetable/faculty');
    return readJson(res, 'Failed to fetch faculty timetable');
  },

  checkFacultyAvailability: async (id, date, hour) => {
    const res = await api.get(`/timetable/faculty/check/${id}?date=${date}&hour=${hour}`);
    return readJson(res, 'Failed to check faculty availability');
  },

  overrideFacultySlot: async (data) => {
    const res = await api.post('/timetable/faculty/override', data);
    return readJson(res, 'Failed to override faculty slot');
  },

  getFacultyOverrides: async () => {
    const res = await api.get('/timetable/faculty/overrides');
    return readJson(res, 'Failed to fetch faculty overrides');
  },

  requestClassCancellation: async (data) => {
    const res = await api.post('/timetable/cancellation-requests', data);
    return readJson(res, 'Failed to request class cancellation');
  },

  getRoomWeekSchedule: async (roomId, weekStart) => {
    const res = await api.get(`/rooms/${roomId}/week-schedule?weekStart=${weekStart}`);
    return readJson(res, 'Failed to fetch room week schedule');
  },

  checkRoomConflict: async (roomId, date, startHour, endHour) => {
    const res = await api.get(`/rooms/${roomId}/conflict-check?date=${date}&startHour=${startHour}&endHour=${endHour}`);
    return readJson(res, 'Failed to check room conflicts');
  }
};

export default roomService;

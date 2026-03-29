import { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import { getTodayRange, getWeekRange, formatRangeToISO } from '../utils/dateHelpers';
import toast from 'react-hot-toast';

export function useAdminData(filterRange) {
  const [bookings, setBookings] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const range = filterRange === 'day' ? getTodayRange(now) : getWeekRange(now);
      const { start: startDate, end: endDate } = formatRangeToISO(range);

      const { bookings: bookingsData, promotions: promotionsData } = await adminService.getAdminData(startDate, endDate);
      setBookings(bookingsData);
      setPromotions(promotionsData);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRange]);

  return { bookings, promotions, loading, fetchData };
}

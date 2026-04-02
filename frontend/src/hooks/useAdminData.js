import { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import { getTodayRange, getWeekRange, formatRangeToISO } from '../utils/dateHelpers';
import toast from 'react-hot-toast';

export function useAdminData(filterRange) {
  const [bookings, setBookings] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [bookingsMeta, setBookingsMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const fetchData = async (page = 1) => {
    setLoading(true);
    try {
      const now = new Date();
      const range = filterRange === 'day' ? getTodayRange(now) : getWeekRange(now);
      const { start: startDate, end: endDate } = formatRangeToISO(range);

      const { 
        bookings: bookingsData, 
        promotions: promotionsData,
        bookingsMeta: meta
      } = await adminService.getAdminData(startDate, endDate, page);
      
      setBookings(bookingsData);
      setPromotions(promotionsData);
      if (meta) setBookingsMeta(meta);
    } catch (err) {
      console.error('Failed to fetch admin data', err);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRange]);

  return { bookings, promotions, bookingsMeta, loading, fetchData };
}

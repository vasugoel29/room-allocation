import { useState, useEffect } from 'react';
import { adminService } from '../services/adminService';
import toast from 'react-hot-toast';

export function useAdminQuickBook(activeTab, fetchData) {
  const [quickBookForm, setQuickBookForm] = useState({
    date: new Date().toISOString().split('T')[0],
    slot: '8',
    purpose: 'Admin Override',
    target_user_id: null,
    roomFilter: 'all'
  });
  const [roomStatuses, setRoomStatuses] = useState([]);
  const [submitting, setSubmitting] = useState(null);

  const fetchRoomStatuses = async () => {
    try {
      const data = await adminService.getRoomStatuses(quickBookForm.date, quickBookForm.slot);
      setRoomStatuses(data);
    } catch (err) {
      console.error('Failed to fetch room statuses', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'quick') {
      fetchRoomStatuses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, quickBookForm.date, quickBookForm.slot]);

  const handleQuickBookSubmit = async (room_name, target_user_id) => {
    if (!target_user_id) {
      toast.error('Please select a user first');
      return;
    }
    setSubmitting(room_name);
    try {
      await adminService.quickBook({
        room_name,
        target_user_id,
        date: quickBookForm.date,
        slot: parseInt(quickBookForm.slot),
        purpose: quickBookForm.purpose || 'Admin Override'
      });
      toast.success(`Room ${room_name} booked successfully!`);
      fetchRoomStatuses();
      if (fetchData) fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Booking failed');
    } finally {
      setSubmitting(null);
    }
  };

  const updateQuickBookForm = (updates) => {
    setQuickBookForm(prev => ({ ...prev, ...updates }));
  };

  return { 
    quickBookForm, roomStatuses, submitting, 
    updateQuickBookForm, handleQuickBookSubmit, fetchRoomStatuses 
  };
}

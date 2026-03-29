import { useState, useCallback, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export function useFacultyRequests(user) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    if (!user || (user.role !== 'FACULTY' && user.role !== 'admin')) {
      return;
    }
    
    try {
      setLoading(true);
      const res = await api.get('/faculty/pending');
      const data = await res.json();
      if (res.ok) {
        setPendingRequests(data);
      } else {
        toast.error(data.error || 'Failed to fetch pending requests');
      }
    } catch {
      toast.error('Network error while fetching requests');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.role === 'FACULTY' || user?.role === 'admin') {
      loadRequests();
    } else {
      setLoading(false);
    }
  }, [user, loadRequests]);

  return { pendingRequests, setPendingRequests, loading, loadRequests };
}

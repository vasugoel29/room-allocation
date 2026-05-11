import { useState, useCallback, useEffect } from 'react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

export function useFacultyRequests(user) {
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRequests = useCallback(async () => {
    if (!user || (user.role !== 'FACULTY' && user.role !== 'ADMIN')) {
      return;
    }
    
    try {
      setLoading(true);
      const res = await api.get('/faculty/pending');
      const data = await res.json();
      
      let mappedTransfers = [];
      try {
        const trRes = await api.get('/transfers/incoming');
        const trData = await trRes.json();
        if (trRes.ok && Array.isArray(trData)) {
          mappedTransfers = trData.map(t => ({
            ...t,
            id: `transfer-${t.id}`,
            originalTransferId: t.id,
            isTransfer: true,
            purpose: t.new_purpose || `Transfer for ${t.room_name}`,
            user_name: t.requester_name || 'Requester'
          }));
        }
      } catch (e) {
        console.warn('Failed to fetch transfers incoming requests', e);
      }

      if (res.ok) {
        setPendingRequests([...data, ...mappedTransfers]);
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
    if (user?.role === 'FACULTY' || user?.role === 'ADMIN') {
      loadRequests();
    } else {
      setLoading(false);
    }
  }, [user, loadRequests]);

  return { pendingRequests, setPendingRequests, loading, loadRequests };
}

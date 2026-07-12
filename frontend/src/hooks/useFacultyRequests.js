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
      let mappedCancellations = [];
      try {
        const trRes = await api.get('/transfers/incoming');
        const trData = await trRes.json();
        if (trRes.ok && Array.isArray(trData)) {
          mappedTransfers = trData.map(t => ({
            ...t,
            id: `transfer-${t.id}`,
            originalTransferId: t.id,
            isTransfer: true,
            purpose: `Transfer slot to ${t.requester_name || 'Requester'} from ${t.requestee_name || 'Requestee'}${t.new_purpose ? ` (${t.new_purpose})` : ''}`,
            user_name: t.requester_name || 'Requester'
          }));
        }
      } catch (e) {
        console.warn('Failed to fetch transfers incoming requests', e);
      }

      try {
        const cancellationRes = await api.get('/timetable/cancellation-requests/pending');
        const cancellations = await cancellationRes.json();
        if (cancellationRes.ok && Array.isArray(cancellations)) {
          mappedCancellations = cancellations.map(request => {
            const date = String(request.class_date).slice(0, 10);
            const hour = String(request.hour).padStart(2, '0');
            const endHour = String(Number(request.hour) + 1).padStart(2, '0');
            return {
              ...request,
              id: `cancellation-${request.id}`,
              cancellationRequestId: request.id,
              isCancellationRequest: true,
              purpose: `Cancel class: ${request.subject_name || 'Scheduled class'}`,
              start_time: `${date}T${hour}:00:00`,
              end_time: `${date}T${endHour}:00:00`
            };
          });
        }
      } catch (e) {
        console.warn('Failed to fetch class cancellation requests', e);
      }

      if (res.ok) {
        setPendingRequests([...data, ...mappedTransfers, ...mappedCancellations]);
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

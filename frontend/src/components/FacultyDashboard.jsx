import React, { useState, useEffect, useContext } from 'react';
import { api } from '../utils/api';
import { AppContext } from '../context/AppContext';
import { Check, X, Clock, Calendar as CalendarIcon, MapPin, User, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

function FacultyDashboard() {
  const { user, bookings, fetchBookings, fetchAvailability } = useContext(AppContext);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDING'); // PENDING | ACCEPTED | MY

  const loadRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/faculty/pending');
      const data = await res.json();
      if (res.ok) {
        setPendingRequests(data);
      } else {
        toast.error(data.error || 'Failed to fetch pending requests');
      }
    } catch (err) {
      toast.error('Network error while fetching requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'FACULTY' || user?.role === 'admin') {
      loadRequests();
    }
  }, [user]);

  const handleAction = async (id, action) => {
    try {
      const res = await api.patch(`/faculty/${id}/${action}`);
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Booking ${action}ed`);
        // Remove from list
        setPendingRequests(prev => prev.filter(r => r.id !== id));
        fetchBookings();
        fetchAvailability();
      } else {
        toast.error(data.error || `Failed to ${action} booking`);
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  const formatTime = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (isoString) => {
    const d = new Date(isoString);
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getFilteredBookings = () => {
    if (activeTab === 'ACCEPTED') {
      return bookings.filter(b => String(b.faculty_id) === String(user.id) && (b.status === 'ACTIVE' || b.status == null));
    }
    if (activeTab === 'MY') {
      return bookings.filter(b => String(b.created_by) === String(user.id));
    }
    return pendingRequests;
  };

  const DISPLAY_BOOKINGS = getFilteredBookings();

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 w-full h-full overflow-y-auto no-scrollbar space-y-6">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-text-primary mb-1">Faculty Portal</h2>
        <p className="text-text-secondary text-sm">Review student requests and manage your scheduled bookings.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 border-b border-border">
        {[
          { id: 'PENDING', label: `Pending Requests (${pendingRequests.length})` },
          { id: 'ACCEPTED', label: 'Accepted Student Bookings' },
          { id: 'MY', label: 'My Bookings' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-bg-secondary text-text-secondary hover:bg-black/5 hover:text-text-primary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {DISPLAY_BOOKINGS.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center border-2 border-dashed border-border rounded-3xl bg-bg-secondary/20">
          <div className="w-16 h-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-4">
            <Check size={32} />
          </div>
          <h3 className="text-xl font-bold text-text-primary mb-2">All Caught Up!</h3>
          <p className="text-text-secondary max-w-sm">There are no bookings to display in this category right now.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DISPLAY_BOOKINGS.map(req => (
            <div key={req.id} className="bg-bg-primary rounded-2xl p-5 border border-border shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start gap-3 border-b border-border pb-4">
                <div className="flex-1">
                  {activeTab === 'PENDING' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold leading-none bg-amber-50 text-amber-600 border border-amber-200 mb-3">
                      <Clock size={12} /> Pending Approval
                    </span>
                  )}
                  {activeTab === 'ACCEPTED' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold leading-none bg-green-50 text-green-600 border border-green-200 mb-3">
                      <Check size={12} /> Accepted Student Request
                    </span>
                  )}
                  {activeTab === 'MY' && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold leading-none bg-indigo-50 text-indigo-600 border border-indigo-200 mb-3">
                      <User size={12} /> My Booking
                    </span>
                  )}
                  <p className="font-bold text-text-primary text-base line-clamp-2">{req.purpose || 'No purpose specified'}</p>
                </div>
              </div>

              <div className="space-y-3 flex-1 text-sm text-text-secondary">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-indigo-500 shrink-0" />
                  <span className="truncate">{req.user_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-indigo-500 shrink-0" />
                  <span className="font-semibold text-text-primary">{req.room_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CalendarIcon size={16} className="text-indigo-500 shrink-0" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{formatDate(req.start_time)}</span>
                    <ChevronRight size={12} className="opacity-50" />
                    <span>{formatTime(req.start_time)} - {formatTime(req.end_time)}</span>
                  </div>
                </div>
              </div>

              {activeTab === 'PENDING' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleAction(req.id, 'approve')}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl font-bold transition-all"
                  >
                    <Check size={16} /> Approve
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'reject')}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 py-2.5 rounded-xl font-bold transition-all"
                  >
                    <X size={16} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FacultyDashboard;

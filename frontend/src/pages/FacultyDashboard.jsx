import React, { useState, useContext } from 'react';
import { facultyService } from '../services/facultyService';
import { AppContext } from '../context/AppContext';
import { Check, X, Clock, Calendar as CalendarIcon, MapPin, User, ChevronRight, GraduationCap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFacultyRequests } from '../hooks/useFacultyRequests';

function FacultyDashboard() {
  const { user, bookings, fetchBookings, fetchAvailability } = useContext(AppContext);
  const [activeTab, setActiveTab] = useState('PENDING'); // PENDING | ACCEPTED | MY
  const { pendingRequests, setPendingRequests, loading } = useFacultyRequests(user);

  const handleAction = async (id, action) => {
    try {
      const data = await facultyService.handleRequest(id, action);
      toast.success(data.message || `Booking ${action}ed`);
      // Remove from list
      setPendingRequests(prev => prev.filter(r => r.id !== id));
      fetchBookings();
      fetchAvailability();
    } catch (err) {
      toast.error(err.message || `Failed to ${action} booking`);
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
        <div className="animate-spin rounded-full h-10 w-10 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 w-full h-full overflow-y-auto no-scrollbar space-y-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-extrabold tracking-tight text-text-primary uppercase font-display">Faculty Portal</h2>
        <p className="text-[10px] sm:text-xs text-text-secondary font-bold uppercase tracking-widest opacity-40 font-display">Review student requests and manage your scheduled bookings.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 bg-tonal-secondary/10 p-1.5 rounded-2xl font-display">
        {[
          { id: 'PENDING', label: `Pending (${pendingRequests.length})` },
          { id: 'ACCEPTED', label: 'Approved' },
          { id: 'MY', label: 'My Bookings' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-2 py-3 rounded-xl text-[10px] sm:text-xs font-extrabold uppercase tracking-tight transition-all text-center ${activeTab === tab.id ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>


      {DISPLAY_BOOKINGS.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center rounded-[2.5rem] bg-tonal-secondary/5 m-4">
          <div className="w-16 h-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center mb-6">
            <Check size={32} />
          </div>
          <h3 className="text-xl font-extrabold text-text-primary mb-2 font-display uppercase tracking-tight">System Synchronized</h3>
          <p className="text-text-secondary max-w-sm text-[10px] font-extrabold opacity-40 uppercase tracking-widest leading-loose">There are no pending actions in this architectural quadrant right now.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DISPLAY_BOOKINGS.map(req => (
            <div key={req.id} className="bg-surface-low rounded-2xl p-5 shadow-ambient flex flex-col gap-4">
              <div className="flex justify-between items-start gap-3 pb-2">
                <div className="flex-1">
                  {activeTab === 'PENDING' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase leading-none bg-tonal-tertiary text-tertiary mb-4 font-display tracking-widest shadow-tertiary">
                      <Clock size={12} /> Pending Approval
                    </span>
                  )}
                  {activeTab === 'ACCEPTED' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase leading-none bg-green-500/10 text-green-600 mb-4 font-display tracking-widest">
                      <Check size={12} /> Accepted Student Request
                    </span>
                  )}
                    {activeTab === 'MY' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase leading-none bg-primary/10 text-primary mb-4 font-display tracking-widest">
                        <GraduationCap size={12} /> My Booking
                      </span>
                    )}
                  <p className="font-extrabold text-text-primary text-base line-clamp-2 uppercase font-display tracking-tight leading-tight">{req.purpose || 'No purpose specified'}</p>
                </div>
              </div>

              <div className="space-y-3 flex-1 text-sm text-text-secondary">
                <div className="flex items-center gap-3">
                  <User size={16} className="text-primary shrink-0" />
                  <span className="truncate font-bold text-[10px] uppercase tracking-widest opacity-60 font-body">{req.user_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <MapPin size={16} className="text-secondary shrink-0" />
                  <span className="font-extrabold text-text-primary uppercase tracking-tight text-xs font-display">{req.room_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CalendarIcon size={16} className="text-primary shrink-0" />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold uppercase text-[10px]">{formatDate(req.start_time)}</span>
                    <ChevronRight size={12} className="opacity-50" />
                    <span className="font-bold uppercase text-[10px]">{formatTime(req.start_time)} - {formatTime(req.end_time)}</span>
                  </div>
                </div>
              </div>

              {activeTab === 'PENDING' && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleAction(req.id, 'approve')}
                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest transition-all shadow-ambient active:scale-95"
                  >
                    <Check size={16} /> Approve
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'reject')}
                    className="flex-1 flex items-center justify-center gap-2 bg-tonal-secondary/10 hover:bg-tonal-secondary/20 text-text-primary py-3 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest transition-all active:scale-95"
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

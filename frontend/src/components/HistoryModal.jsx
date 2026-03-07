import React, { useState } from 'react';
import { X, Clock, User, Hash, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';

const HistoryModal = ({ bookings, onClose, onSuccess }) => {
  const user = JSON.parse(localStorage.getItem('user'));
  const [filterMe, setFilterMe] = useState(user?.role !== 'admin');
  const [timeFilter, setTimeFilter] = useState('WEEK'); // TODAY, WEEK, PAST
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const now = new Date();
  
  // Today range
  const todayStart = new Date(now);
  todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23,59,59,999);

  // This Week range (Mon-Sun)
  const curr = new Date(now);
  const first = curr.getDate() - (curr.getDay() === 0 ? 6 : curr.getDay() - 1); // Monday
  const last = first + 6; // Sunday
  const weekStart = new Date(curr.setDate(first));
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(curr.setDate(last));
  weekEnd.setHours(23,59,59,999);

  const filteredBookings = bookings.filter(b => {
    // 1. Role/Owner filter
    if (filterMe && String(b.created_by) !== String(user?.id)) return false;

    const bStart = new Date(b.start_time);
    const bEnd = new Date(b.end_time);

    // 2. Status filter: For Today/Week, only show ACTIVE. For Past, show all.
    if (timeFilter !== 'PAST' && (b.status || 'ACTIVE') !== 'ACTIVE') return false;

    // 3. Time filter
    if (timeFilter === 'TODAY') {
      return bStart >= todayStart && bStart <= todayEnd;
    }
    if (timeFilter === 'WEEK') {
      return bStart >= weekStart && bStart <= weekEnd;
    }
    if (timeFilter === 'PAST') {
      return bEnd < now;
    }

    return true;
  }).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  const handleCancel = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await api.patch(`/bookings/${bookingId}/cancel`);
      if (res.ok) {
        onSuccess?.();
      } else {
        const data = await res.json();
        setError(data.error || 'Cancellation failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-4xl glass rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in duration-300 border border-black/5">
        
        {/* Header */}
        <div className="p-8 border-b border-black/5 bg-black/[0.01]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{user?.role === 'admin' ? 'Booking History' : 'My Bookings'}</h2>
              <p className="text-slate-500 text-sm">{user?.role === 'admin' ? 'Review active room reservations.' : 'Track your active room reservations.'}</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-black/5 rounded-full text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex flex-wrap gap-4 items-center justify-between">
             <div className="flex bg-black/5 p-1 rounded-2xl border border-black/5">
                {[
                  { id: 'TODAY', label: 'Today' },
                  { id: 'WEEK', label: 'This Week' },
                  { id: 'PAST', label: 'Past' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setTimeFilter(f.id)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${timeFilter === f.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {f.label}
                  </button>
                ))}
             </div>

             <div className="flex items-center gap-4">
                {user?.role === 'admin' && (
                  <button 
                      onClick={() => setFilterMe(!filterMe)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${filterMe ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white border-black/5 text-slate-600 hover:border-black/10'}`}
                  >
                      {filterMe ? 'My Bookings ✓' : 'My Bookings'}
                  </button>
                )}

                {error && (
                    <div className="text-red-500 text-xs flex items-center gap-1 font-medium bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}
             </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-white/50">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex p-4 bg-black/5 rounded-2xl text-slate-400 mb-4">
                <Clock size={40} />
              </div>
              <p className="text-slate-500 font-medium">No {timeFilter.toLowerCase() === 'past' ? '' : 'active'} bookings found for this period.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <th className="pb-4 px-4">Room</th>
                    <th className="pb-4 px-4">Time</th>
                    <th className="pb-4 px-4">Booked By</th>
                    <th className="pb-4 px-4">Purpose</th>
                    <th className="pb-4 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-black/5 hover:bg-black/[0.01] transition-colors group">
                      <td className="py-4 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <Hash size={16} />
                          </div>
                          {booking.room_name}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-600">
                        {new Date(booking.start_time).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          weekday: 'short'
                        })} at {new Date(booking.start_time).toLocaleTimeString('en-US', { 
                          hour: 'numeric', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-indigo-600 font-medium">
                          <User size={14} />
                          {booking.user_name}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-500 italic max-w-[200px] truncate">
                        {booking.purpose || 'No purpose'}
                      </td>
                      <td className="py-4 px-4 text-right">
                        {String(booking.created_by) === String(user?.id) && (
                          <button 
                            onClick={() => handleCancel(booking.id)}
                            disabled={loading}
                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Cancel Booking"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-black/[0.01] border-t border-black/5 flex justify-end items-center gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-white hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-700 transition-all border border-black/5 shadow-sm active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;

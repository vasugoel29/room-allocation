import React, { useState, useContext } from 'react';
import { X, Clock, User, Hash, Trash2, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import { AppContext } from '../context/AppContext';

const HistoryModal = ({ onClose }) => {
  const { user, bookings, fetchRooms, fetchBookings, fetchAvailability } = useContext(AppContext);
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
  // Logic: Match the Calendar's "This Week" (if it's Sat/Sun, we look at the coming week)
  const currentDay = now.getDay() || 7;
  const offset = currentDay >= 6 ? 7 : 0;
  
  const mondayOfView = new Date(now);
  mondayOfView.setDate(now.getDate() - currentDay + 1 + offset);
  
  const weekStart = new Date(mondayOfView);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // Sunday
  weekEnd.setHours(23, 59, 59, 999);

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
        fetchRooms();
        fetchBookings();
        fetchAvailability();
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
      <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-4xl glass dark:bg-slate-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in duration-300 border border-black/5">
        
        {/* Header */}
        <div className="p-8 border-b border-border bg-bg-secondary/30">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold text-text-primary mb-1">{user?.role === 'admin' ? 'Booking History' : 'My Bookings'}</h2>
              <p className="text-text-secondary text-sm">{user?.role === 'admin' ? 'Review active room reservations.' : 'Track your active room reservations.'}</p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-text-secondary hover:text-text-primary transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex flex-wrap gap-4 items-center justify-between">
             <div className="flex bg-bg-secondary p-1 rounded-xl border border-border shadow-sm">
                {[
                  { id: 'TODAY', label: 'Today' },
                  { id: 'WEEK', label: 'This Week' },
                  { id: 'PAST', label: 'Past' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setTimeFilter(f.id)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timeFilter === f.id ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                  >
                    {f.label}
                  </button>
                ))}
             </div>

             <div className="flex items-center gap-4">
                {user?.role === 'admin' && (
                  <button 
                      onClick={() => setFilterMe(!filterMe)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${filterMe ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-bg-secondary border-border text-text-secondary hover:text-text-primary'}`}
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-bg-primary/30 no-scrollbar">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-10 sm:py-20">
              <div className="inline-flex p-4 sm:p-6 bg-bg-secondary rounded-2xl sm:rounded-[2rem] text-text-secondary/20 mb-4 border border-border shadow-inner">
                <Clock size={32} sm:size={48} />
              </div>
              <p className="text-text-secondary font-medium text-sm sm:text-base">No {timeFilter.toLowerCase() === 'past' ? '' : 'active'} bookings found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Desktop View Table */}
              <div className="hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-text-secondary text-[10px] uppercase font-black tracking-[0.2em] border-b border-border/50">
                      <th className="pb-4 px-4">Room</th>
                      <th className="pb-4 px-4 text-center">Time</th>
                      <th className="pb-4 px-4 text-center">Booker</th>
                      <th className="pb-4 px-4">Purpose</th>
                      <th className="pb-4 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {filteredBookings.map((booking) => (
                      <tr key={booking.id} className="border-b border-border/30 hover:bg-bg-secondary/30 transition-colors group">
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent shadow-sm">
                              <Hash size={18} />
                            </div>
                            <span className="font-bold text-text-primary text-base">{booking.room_name}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span className="text-text-primary font-bold text-sm">
                              {new Date(booking.start_time).toLocaleDateString('en-US', { 
                                month: 'short', 
                                day: 'numeric',
                                weekday: 'short'
                              })}
                            </span>
                            <span className="text-text-secondary text-[10px] uppercase font-black tracking-widest mt-0.5">
                              {new Date(booking.start_time).toLocaleTimeString('en-US', { 
                                hour: 'numeric', 
                                minute: '2-digit',
                                hour12: true 
                              })}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/5 border border-accent/10 text-accent font-black text-xs">
                            <User size={12} />
                            {booking.user_name}
                          </div>
                        </td>
                        <td className="py-4 px-4 max-w-[200px]">
                          <p className="text-text-secondary text-sm italic line-clamp-2 leading-relaxed">
                            {booking.purpose || 'No purpose provided'}
                          </p>
                        </td>
                        <td className="py-4 px-4 text-right">
                          {String(booking.created_by) === String(user?.id) && (booking.status || 'ACTIVE') === 'ACTIVE' && new Date(booking.end_time) > now && (
                            <button 
                              onClick={() => handleCancel(booking.id)}
                              disabled={loading}
                              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
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

              {/* Mobile View Cards */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredBookings.map((booking) => (
                  <div key={booking.id} className="p-4 bg-bg-secondary/50 rounded-2xl border border-border space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                          <Hash size={14} />
                        </div>
                        <span className="font-bold text-text-primary">{booking.room_name}</span>
                      </div>
                      {String(booking.created_by) === String(user?.id) && (booking.status || 'ACTIVE') === 'ACTIVE' && new Date(booking.end_time) > now && (
                        <button 
                          onClick={() => handleCancel(booking.id)}
                          disabled={loading}
                          className="p-2 text-red-500 bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                       <div className="px-2 py-1 rounded-md bg-accent/5 text-accent border border-accent/10 uppercase tracking-wider">
                         {new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                       </div>
                       <div className="px-2 py-1 rounded-md bg-accent/5 text-accent border border-accent/10 uppercase tracking-wider">
                         {new Date(booking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                       </div>
                       <div className="px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center gap-1">
                         <User size={10} /> {booking.user_name}
                       </div>
                    </div>

                    {booking.purpose && (
                      <p className="text-xs text-text-secondary italic leading-relaxed bg-bg-primary/50 p-2 rounded-lg border border-border/50">
                        "{booking.purpose}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-bg-secondary/50 border-t border-border flex justify-end items-center gap-4">
          <button 
            onClick={onClose}
            className="px-8 py-3 bg-bg-primary hover:bg-bg-secondary rounded-xl text-sm font-black text-text-primary transition-all border border-border shadow-sm active:scale-[0.98] uppercase tracking-widest"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;

import React, { useState, useContext, useEffect } from 'react';
import { X, Clock, User, Hash, Trash2, AlertCircle, Check, ArrowRightLeft } from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { getTodayRange, getWeekRange } from '../../utils/dateHelpers';
import { bookingService } from '../../services/bookingService';
import { roomService } from '../../services/roomService';

import PageSearch from '../../components/ui/PageSearch';

const HistoryView = ({ onClose }) => {
  const { user, bookings, fetchRooms, fetchBookings, fetchAvailability, incomingTransfers, outgoingTransfers, fetchTransfers, pendingTransferCount } = useContext(AppContext);
  const [myOverrides, setMyOverrides] = useState([]);
  const [filterMe] = useState(user?.role !== 'admin');
  const [timeFilter, setTimeFilter] = useState('WEEK'); // TODAY, WEEK, PAST, TRANSFERS
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [, setError] = useState('');
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', action: null });

  const fetchHistory = async () => {
    if (!user) return;
    try {
      const overrides = await roomService.getMyAvailability();
      setMyOverrides(overrides);
    } catch (err) {
      console.error('Failed to fetch overrides', err);
    }
  };

  useEffect(() => {
    if (user?.role !== 'VIEWER') {
      fetchTransfers();
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTransferAction = async (id, action) => {
    setLoading(true);
    try {
      await bookingService.handleTransferAction(id, action);
      toast.success(`Transfer ${action}ed`);
      fetchTransfers();
      fetchBookings();
      fetchAvailability();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const now = new Date();
  const { start: todayStart, end: todayEnd } = getTodayRange(now);
  const { start: weekStart, end: weekEnd } = getWeekRange(now);

  // Merged History (Bookings + Cancellations)
  const historyItems = [
    ...bookings.map(b => ({ ...b, type: 'BOOKING' })),
    ...myOverrides.map(o => ({ 
      id: `ov-${o.id}`, 
      type: 'OVERRIDE',
      room_name: o.room_name,
      start_time: `${o.day}T${String(o.hour).padStart(2, '0')}:00:00`,
      end_time: `${o.day}T${String(o.hour+1).padStart(2, '0')}:00:00`,
      created_by: o.user_id,
      status: o.is_available ? 'FREED' : 'BLOCKED',
      class_name: 'Manual Override',
      purpose: o.is_available ? 'Room was freed from timetable' : 'Room was manually blocked'
    }))
  ];

  const filteredHistory = historyItems.filter(item => {
    if (filterMe && String(item.created_by) !== String(user?.id)) return false;

    // Contextual Search Filter
    if (searchText) {
      const search = searchText.toLowerCase();
      const matchesRoom = item.room_name?.toLowerCase().includes(search);
      const matchesClass = item.class_name?.toLowerCase().includes(search);
      const matchesPurpose = item.purpose?.toLowerCase().includes(search);
      if (!matchesRoom && !matchesClass && !matchesPurpose) return false;
    }

    const bStart = new Date(item.start_time);
    const bEnd = new Date(item.end_time);
    const bStatus = item.status || 'ACTIVE';

    if (timeFilter !== 'PAST' && !['ACTIVE', 'PENDING', 'CANCELLED', 'FREED', 'BLOCKED'].includes(bStatus)) return false;

    if (timeFilter === 'TODAY') return bStart >= todayStart && bStart <= todayEnd;
    if (timeFilter === 'WEEK') return bStart >= weekStart && bStart <= weekEnd;
    if (timeFilter === 'PAST') return bEnd < now;

    return true;
  }).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  const handleCancel = (bookingId) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Cancel Booking',
      message: 'Are you sure you want to cancel this booking?',
      confirmText: 'Cancel Booking',
      confirmType: 'danger',
      action: async () => {
        setLoading(true);
        setError('');
        try {
          await bookingService.cancelBooking(bookingId);
          fetchHistory();
          fetchRooms();
          fetchBookings();
          fetchAvailability();
          toast.success('Booking cancelled');
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden rounded-2xl">
      {/* Page Header (Synced with Calendar/Timetable) */}
      <div className="p-4 sm:p-6 bg-tonal-secondary/10 backdrop-blur-md shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight uppercase leading-none font-display">
              {user?.role === 'admin' ? 'Allocation Registry' : 'My Schedule'}
            </h2>
            <p className="text-[10px] sm:text-xs text-text-secondary font-bold uppercase tracking-widest mt-1 opacity-40 font-display">
              {user?.role === 'admin' ? 'Review room reservations campus-wide' : 'Track your active room reservations'}
            </p>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
            <PageSearch 
              value={searchText} 
              onChange={setSearchText} 
              placeholder="Search bookings..." 
              className="flex-1 sm:w-64"
            />
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full text-text-secondary hover:text-text-primary transition-colors lg:hidden"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
              {[
                { id: 'TODAY', label: 'Today' },
                { id: 'WEEK', label: 'This Week' },
                { id: 'PAST', label: 'Past' },
                { id: 'TRANSFERS', label: 'Transfers' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setTimeFilter(f.id)}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 ${timeFilter === f.id ? 'bg-primary text-white shadow-ambient' : 'bg-tonal-secondary/10 text-text-secondary hover:text-text-primary'}`}
                >
                  {f.label}
                  {f.id === 'TRANSFERS' && pendingTransferCount > 0 && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] rounded-full font-extrabold shadow-tertiary ${timeFilter === 'TRANSFERS' ? 'bg-white text-primary' : 'bg-tertiary text-white'}`}>
                      {pendingTransferCount}
                    </span>
                  )}
                </button>
              ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-10 no-scrollbar bg-transparent">
               {timeFilter === 'TRANSFERS' ? (
          <div className="space-y-10 animate-in fade-in duration-300">
            {/* Incoming Transfers */}
            <div className="space-y-6">
              <h3 className="text-xl font-extrabold text-text-primary flex items-center gap-3 tracking-tight font-display uppercase italic">
                <ArrowRightLeft size={22} className="text-secondary"/> Incoming Requests
              </h3>
              {incomingTransfers.length === 0 ? (
                <div className="p-16 text-center bg-tonal-secondary/5 rounded-[2.5rem] flex flex-col items-center gap-4">
                   <ArrowRightLeft size={48} className="text-text-secondary/10" />
                   <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-20">No pending inbound transfers</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {incomingTransfers.map(t => (
                    <div key={t.id} className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 group hover:bg-tonal-secondary/15 transition-all shadow-ambient">
                      <div className="flex justify-between items-start mb-6">
                        <span className="font-extrabold text-text-primary flex items-center gap-3 text-2xl tracking-tight font-display uppercase">
                          {t.room_name} 
                        </span>
                        {t.status === 'PENDING' && <span className="text-[9px] bg-tonal-tertiary text-tertiary px-4 py-1.5 rounded-full font-extrabold shadow-tertiary uppercase tracking-widest whitespace-nowrap">Pending</span>}
                      </div>
                      <p className="text-sm text-text-secondary mb-6 font-bold leading-relaxed opacity-60">
                        <span className="text-text-primary font-extrabold uppercase tracking-tight">{t.requester_name}</span> has requested to take over your booking at {new Date(t.start_time).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'})} on {new Date(t.start_time).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})}.
                      </p>
                      <div className="text-xs italic text-text-secondary bg-tonal-secondary/5 p-5 rounded-[1.5rem] font-bold leading-loose">
                        "{t.new_purpose || 'No purpose provided'}"
                      </div>
                      {t.status === 'PENDING' && t.booking_status !== 'CANCELLED' && (
                        <div className="flex gap-4 mt-8">
                          <button onClick={() => handleTransferAction(t.id, 'accept')} disabled={loading} className="flex-1 bg-primary text-white font-extrabold py-4 rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 shadow-ambient active:scale-95 transition-all">
                            <Check size={18} /> Accept
                          </button>
                          <button onClick={() => handleTransferAction(t.id, 'reject')} disabled={loading} className="flex-1 bg-tonal-secondary/10 text-text-primary font-extrabold py-4 rounded-2xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
                            <X size={18} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outgoing Transfers */}
            <div className="space-y-6">
              <h3 className="text-xl font-extrabold text-text-primary pt-14 tracking-tight font-display uppercase italic opacity-40">
                Outgoing Transfers
              </h3>
              {outgoingTransfers.length === 0 ? (
                <div className="p-16 text-center bg-tonal-secondary/5 rounded-[2.5rem] flex flex-col items-center gap-4">
                   <ArrowRightLeft size={48} className="text-text-secondary/10" />
                   <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest opacity-20">No outbound active requests</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {outgoingTransfers.map(t => (
                    <div key={t.id} className="bg-tonal-secondary/10 rounded-[2rem] p-6 flex items-center justify-between hover:bg-tonal-secondary/15 transition-all">
                      <div>
                        <p className="font-extrabold text-text-primary text-lg flex items-center gap-4 truncate tracking-tight uppercase font-display">
                          {t.room_name} <ArrowRightLeft size={16} className="text-secondary opacity-40 shrink-0"/>
                          <span className="whitespace-nowrap font-extrabold text-primary">{new Date(t.start_time).toLocaleDateString()} @ {new Date(t.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </p>
                        <p className="text-[10px] text-text-secondary font-extrabold mt-2 max-w-sm truncate uppercase tracking-[0.2em] opacity-30 font-display">To: {t.owner_name} - {t.new_purpose}</p>
                      </div>
                      <div className="shrink-0 ml-6">
                        {t.status === 'PENDING' && <span className="text-[9px] font-extrabold uppercase tracking-widest bg-tonal-tertiary text-tertiary px-5 py-2 rounded-full shadow-tertiary">In Review</span>}
                        {t.status === 'ACCEPTED' && <span className="text-[9px] font-extrabold uppercase tracking-widest bg-green-500/10 text-green-500 px-5 py-2 rounded-full">Synchronized</span>}
                        {t.status === 'REJECTED' && <span className="text-[9px] font-extrabold uppercase tracking-widest bg-red-500/10 text-red-500 px-5 py-2 rounded-full">Dismissed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28 text-center animate-in fade-in duration-700">
            <div className="w-24 h-24 bg-tonal-secondary/5 rounded-[3rem] flex items-center justify-center text-secondary/10 mb-10">
              <Clock size={48} strokeWidth={1.5} />
            </div>
            <h4 className="text-2xl font-extrabold text-text-primary tracking-tight mb-3 uppercase font-display italic opacity-40">Timeline Empty</h4>
            <p className="text-[10px] text-text-secondary font-extrabold uppercase tracking-widest max-w-[280px] leading-relaxed opacity-20">No matching logs found in this temporal slice.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Desktop View Table */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-text-secondary text-[10px] uppercase font-extrabold tracking-[0.2em] opacity-40">
                    <th className="pb-6 px-6">Room / Type</th>
                    <th className="pb-6 px-6 text-center">Time</th>
                    <th className="pb-6 px-6 text-center">Booker/Reference</th>
                    <th className="pb-6 px-6">Details</th>
                    <th className="pb-6 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-tonal-secondary/5 transition-colors group">
                      <td className="py-8 px-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-ambient shrink-0 ${item.type === 'OVERRIDE' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                            {item.type === 'OVERRIDE' ? <Trash2 size={20} strokeWidth={2.5}/> : <Hash size={20} strokeWidth={2.5}/>}
                          </div>
                          <div className="flex flex-col items-start gap-1.5">
                            <span className="font-extrabold text-text-primary text-lg tracking-tight leading-none uppercase font-display">{item.room_name}</span>
                            {(item.status === 'PENDING') && (
                              <span className="px-3 py-1 rounded-lg bg-tonal-tertiary text-tertiary text-[8px] font-extrabold uppercase tracking-widest shadow-tertiary">
                                Pending
                              </span>
                            )}
                            {(item.status === 'ACTIVE' || item.status === 'CONFIRMED' || item.status == null) && item.type === 'BOOKING' && (
                              <span className="px-3 py-1 rounded-lg bg-green-500/10 text-green-500 text-[8px] font-extrabold uppercase tracking-widest">
                                Validated
                              </span>
                            )}
                            {(item.status === 'FREED') && (
                              <span className="px-3 py-1 rounded-lg bg-primary/20 text-primary text-[8px] font-extrabold uppercase tracking-widest">
                                Freed
                              </span>
                            )}
                            {(item.status === 'CANCELLED') && (
                              <span className="px-3 py-1 rounded-lg bg-red-500/10 text-red-500 text-[8px] font-extrabold uppercase tracking-widest">
                                Revoked
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-8 px-6 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-text-primary font-black text-base tracking-tighter leading-none">
                            {new Date(item.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                          </span>
                          <span className="text-accent text-[10px] uppercase font-black tracking-widest mt-2 leading-none opacity-80">
                            {new Date(item.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      <td className="py-8 px-6 text-center">
                        <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-tonal-secondary/10 text-text-primary font-extrabold text-[10px] uppercase tracking-widest">
                          {item.type === 'OVERRIDE' ? <AlertCircle size={14} className="text-secondary" /> : <User size={14} className="text-primary" />}
                          {item.class_name}
                        </div>
                      </td>
                      <td className="py-8 px-6 max-w-[200px]">
                        <p className="text-text-secondary text-xs italic line-clamp-2 leading-relaxed font-bold opacity-60">
                          {item.purpose || 'No purpose provided'}
                        </p>
                      </td>
                      <td className="py-8 px-6 text-right">
                        {item.type === 'BOOKING' && String(item.created_by) === String(user?.id) && (item.status || 'ACTIVE') === 'ACTIVE' && new Date(item.end_time) > now && (
                          <button 
                            onClick={() => handleCancel(item.id)}
                            disabled={loading}
                            className="p-3 text-red-500 hover:text-white hover:bg-red-500 rounded-2xl transition-all shadow-ambient active:scale-95"
                          >
                            <Trash2 size={20} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View Cards */}
            <div className="grid grid-cols-1 gap-6 md:hidden">
              {filteredHistory.map((item) => (
                <div key={item.id} className="bg-tonal-secondary/10 rounded-[2.5rem] p-7 space-y-7 group active:translate-y-1 transition-all shadow-ambient">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-5">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-ambient shrink-0 ${item.type === 'OVERRIDE' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                        {item.type === 'OVERRIDE' ? <Trash2 size={28} strokeWidth={2.5}/> : <Hash size={28} strokeWidth={2.5}/>}
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="font-extrabold text-text-primary leading-none text-xl tracking-tight font-display uppercase">{item.room_name}</span>
                        {(item.status === 'PENDING') && (
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-tertiary bg-tonal-tertiary px-4 py-1.5 rounded-full inline-block shadow-tertiary">Pending</span>
                        )}
                        {(item.status === 'ACTIVE' || item.status === 'CONFIRMED' || item.status == null) && item.type === 'BOOKING' && (
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-green-500 bg-green-500/10 px-4 py-1.5 rounded-full inline-block">Valid</span>
                        )}
                        {(item.status === 'FREED') && (
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-primary bg-primary/20 px-4 py-1.5 rounded-full inline-block">Freed</span>
                        )}
                        {(item.status === 'CANCELLED') && (
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-500 bg-red-500/10 px-4 py-1.5 rounded-full inline-block">Revoked</span>
                        )}
                      </div>
                    </div>
                    {item.type === 'BOOKING' && String(item.created_by) === String(user?.id) && (item.status || 'ACTIVE') === 'ACTIVE' && new Date(item.end_time) > now && (
                      <button 
                        onClick={() => handleCancel(item.id)}
                        disabled={loading}
                        className="p-4 text-red-500 bg-tonal-secondary/10 rounded-2xl active:bg-red-500 active:text-white transition-all shadow-ambient"
                      >
                        <Trash2 size={22} />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                     <div className={`px-5 py-2.5 rounded-2xl text-white font-extrabold text-[10px] uppercase tracking-widest shadow-ambient ${item.type === 'OVERRIDE' ? 'bg-secondary' : 'bg-primary'}`}>
                       {new Date(item.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                     </div>
                     <div className="px-5 py-2.5 rounded-2xl bg-tonal-secondary/10 text-text-primary font-extrabold text-[10px] uppercase tracking-widest shadow-ambient">
                       {new Date(item.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                     </div>
                     <div className="px-5 py-2.5 rounded-2xl bg-tonal-secondary/10 text-text-primary font-extrabold text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 shadow-ambient opacity-40">
                       {item.type === 'OVERRIDE' ? <AlertCircle size={12} strokeWidth={3}/> : <User size={12} strokeWidth={3}/>} {item.class_name}
                     </div>
                  </div>

                  {item.purpose && (
                    <p className="text-sm text-text-secondary italic leading-relaxed bg-tonal-secondary/5 p-6 rounded-[2rem] font-bold opacity-60">
                      "{item.purpose}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={() => confirmConfig.action?.()}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmType={confirmConfig.confirmType}
      />
    </div>
  );
};

export default HistoryView;

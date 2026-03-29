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
      <div className="p-4 sm:p-6 border-b border-white/5 bg-bg-secondary/40 backdrop-blur-sm rounded-t-2xl shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-text-primary tracking-tighter uppercase italic leading-none">
              {user?.role === 'admin' ? 'Booking History' : 'My Bookings'}
            </h2>
            <p className="text-[10px] sm:text-xs text-text-secondary font-black uppercase tracking-widest mt-1 opacity-60">
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
                  className={`px-3 sm:px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2 border ${timeFilter === f.id ? 'bg-accent text-white border-accent shadow-lg shadow-accent/20' : 'bg-transparent text-text-secondary border-white/5 hover:text-text-primary hover:bg-white/5'}`}
                >
                  {f.label}
                  {f.id === 'TRANSFERS' && pendingTransferCount > 0 && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 text-[10px] rounded-full font-black ${timeFilter === 'TRANSFERS' ? 'bg-white text-accent' : 'bg-red-500 text-white'}`}>
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
              <h3 className="text-xl font-black text-text-primary flex items-center gap-2 tracking-tight">
                <ArrowRightLeft size={22} className="text-accent"/> Incoming Requests
              </h3>
              {incomingTransfers.length === 0 ? (
                <div className="p-12 text-center bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
                   <p className="text-sm text-text-secondary font-medium opacity-60">No incoming requests to transfer your rooms.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {incomingTransfers.map(t => (
                    <div key={t.id} className="glass rounded-[2rem] p-6 border-white/5 group hover:border-accent/40 transition-all shadow-xl">
                      <div className="flex justify-between items-start mb-4">
                        <span className="font-black text-text-primary flex items-center gap-2 text-xl tracking-tighter">
                          {t.room_name} 
                        </span>
                        {t.status === 'PENDING' && <span className="text-[10px] bg-amber-500/10 text-amber-500 px-3 py-1 rounded-full font-black border border-amber-500/20 uppercase tracking-widest whitespace-nowrap">Pending</span>}
                      </div>
                      <p className="text-sm text-text-secondary mb-4 font-bold leading-relaxed">
                        <span className="text-text-primary text-base">{t.requester_name}</span> has requested to take over your booking at {new Date(t.start_time).toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit'})} on {new Date(t.start_time).toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric'})}.
                      </p>
                      <div className="text-sm italic text-text-secondary/80 mb-6 bg-white/5 p-4 rounded-2xl border border-white/5 font-medium leading-loose">
                        "{t.new_purpose || 'No purpose provided'}"
                      </div>
                      {t.status === 'PENDING' && t.booking_status !== 'CANCELLED' && (
                        <div className="flex gap-3">
                          <button onClick={() => handleTransferAction(t.id, 'accept')} disabled={loading} className="flex-1 bg-accent text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 hover:bg-accent/80 active:scale-95 transition-all shadow-lg shadow-accent/20">
                            <Check size={18} /> Accept
                          </button>
                          <button onClick={() => handleTransferAction(t.id, 'reject')} disabled={loading} className="flex-1 bg-white/5 text-text-primary font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 hover:bg-white/10 border border-white/10 active:scale-95 transition-all">
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
              <h3 className="text-xl font-black text-text-primary border-t border-white/5 pt-10 tracking-tight">
                Requests Sent
              </h3>
              {outgoingTransfers.length === 0 ? (
                <div className="p-12 text-center bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
                   <p className="text-sm text-text-secondary font-medium opacity-60">You have not sent any transfer requests.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {outgoingTransfers.map(t => (
                    <div key={t.id} className="glass rounded-[2rem] p-5 border-white/5 flex items-center justify-between hover:border-accent/30 transition-all">
                      <div>
                        <p className="font-black text-text-primary text-base flex items-center gap-3 truncate tracking-tighter">
                          {t.room_name} <ArrowRightLeft size={16} className="text-text-secondary/30 flex-shrink-0"/>
                          <span className="whitespace-nowrap font-bold text-accent">{new Date(t.start_time).toLocaleDateString()} @ {new Date(t.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        </p>
                        <p className="text-[10px] text-text-secondary font-black mt-1.5 max-w-sm truncate text-ellipsis uppercase tracking-widest opacity-60">To: {t.owner_name} - "{t.new_purpose}"</p>
                      </div>
                      <div className="shrink-0 ml-4">
                        {t.status === 'PENDING' && <span className="text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 px-4 py-1.5 rounded-full border border-amber-500/20">Pending</span>}
                        {t.status === 'ACCEPTED' && <span className="text-[10px] font-black uppercase tracking-widest bg-green-500/10 text-green-500 px-4 py-1.5 rounded-full border border-green-500/20">Accepted</span>}
                        {t.status === 'REJECTED' && <span className="text-[10px] font-black uppercase tracking-widest bg-red-500/10 text-red-500 px-4 py-1.5 rounded-full border border-red-500/20">Rejected</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in duration-500">
            <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center text-text-secondary/20 mb-8 border border-white/5 shadow-inner">
              <Clock size={48} strokeWidth={1.5} />
            </div>
            <h4 className="text-2xl font-black text-text-primary tracking-tighter mb-2 italic uppercase">No History Found</h4>
            <p className="text-sm text-text-secondary font-bold max-w-[240px] leading-relaxed opacity-60">There are no {timeFilter.toLowerCase()} records in our system currently.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Desktop View Table */}
            <div className="hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-text-secondary text-[10px] uppercase font-black tracking-[0.2em] border-b border-white/5">
                    <th className="pb-6 px-6">Room / Type</th>
                    <th className="pb-6 px-6 text-center">Time</th>
                    <th className="pb-6 px-6 text-center">Booker/Reference</th>
                    <th className="pb-6 px-6">Details</th>
                    <th className="pb-6 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                      <td className="py-8 px-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ${item.type === 'OVERRIDE' ? 'bg-accent/80 shadow-accent/20' : 'bg-accent shadow-accent/20'}`}>
                            {item.type === 'OVERRIDE' ? <Trash2 size={20} strokeWidth={2.5}/> : <Hash size={20} strokeWidth={2.5}/>}
                          </div>
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-black text-text-primary text-lg tracking-tighter leading-none">{item.room_name}</span>
                            {(item.status === 'PENDING') && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                                Pending
                              </span>
                            )}
                            {(item.status === 'ACTIVE' || item.status === 'CONFIRMED' || item.status == null) && item.type === 'BOOKING' && (
                              <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 border border-green-500/20 text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                                Confirmed
                              </span>
                            )}
                            {(item.status === 'FREED') && (
                              <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent border border-accent/20 text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                                Freed Room
                              </span>
                            )}
                            {(item.status === 'CANCELLED') && (
                              <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 border border-red-500/20 text-[8px] font-black uppercase tracking-widest whitespace-nowrap">
                                Cancelled
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
                        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-text-primary font-black text-xs uppercase tracking-tighter">
                          {item.type === 'OVERRIDE' ? <AlertCircle size={14} className="text-accent" /> : <User size={14} className="text-accent" />}
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
                            className="p-3 text-red-500 hover:text-white hover:bg-red-500 rounded-2xl transition-all shadow-sm active:scale-95 border border-transparent hover:border-red-600"
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
                <div key={item.id} className="glass rounded-[2rem] p-6 border-white/5 space-y-6 group active:translate-y-1 transition-all shadow-xl">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-[1.25rem] flex items-center justify-center shadow-lg shrink-0 ${item.type === 'OVERRIDE' ? 'bg-accent/80 shadow-accent/20 text-white' : 'bg-accent shadow-accent/20 text-white'}`}>
                        {item.type === 'OVERRIDE' ? <Trash2 size={24} strokeWidth={2.5}/> : <Hash size={24} strokeWidth={2.5}/>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-black text-text-primary leading-none text-xl tracking-tighter">{item.room_name}</span>
                        {(item.status === 'PENDING') && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full inline-block border border-amber-500/20">Pending</span>
                        )}
                        {(item.status === 'ACTIVE' || item.status === 'CONFIRMED' || item.status == null) && item.type === 'BOOKING' && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-green-500 bg-green-500/10 px-3 py-1 rounded-full inline-block border border-green-500/20">Confirmed</span>
                        )}
                        {(item.status === 'FREED') && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-accent bg-accent/20 px-3 py-1 rounded-full inline-block border border-accent/20">Freed Room</span>
                        )}
                        {(item.status === 'CANCELLED') && (
                          <span className="text-[9px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 px-3 py-1 rounded-full inline-block border border-red-500/20">Cancelled</span>
                        )}
                      </div>
                    </div>
                    {item.type === 'BOOKING' && String(item.created_by) === String(user?.id) && (item.status || 'ACTIVE') === 'ACTIVE' && new Date(item.end_time) > now && (
                      <button 
                        onClick={() => handleCancel(item.id)}
                        disabled={loading}
                        className="p-4 text-red-500 bg-white/5 rounded-2xl active:bg-red-500 active:text-white transition-all border border-white/10 shadow-sm"
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                     <div className={`px-4 py-2 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-lg ${item.type === 'OVERRIDE' ? 'bg-accent/80 shadow-accent/20' : 'bg-accent shadow-accent/20'}`}>
                       {new Date(item.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                     </div>
                     <div className="px-4 py-2 rounded-2xl bg-white/5 text-text-primary font-black text-[10px] uppercase tracking-widest border border-white/10 shadow-inner">
                       {new Date(item.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                     </div>
                     <div className="px-4 py-2 rounded-2xl bg-white/5 text-text-primary font-black text-[10px] uppercase tracking-widest flex items-center gap-2 border border-white/10 shadow-inner">
                       {item.type === 'OVERRIDE' ? <AlertCircle size={12} strokeWidth={3}/> : <User size={12} strokeWidth={3}/>} {item.class_name}
                     </div>
                  </div>

                  {item.purpose && (
                    <p className="text-sm text-text-secondary italic leading-relaxed bg-white/5 p-5 rounded-[1.5rem] border border-white/5 font-bold opacity-80">
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

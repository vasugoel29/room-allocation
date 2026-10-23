import React, { useState, useContext, useEffect } from 'react';
import { X, Clock, User, Hash, Trash2, AlertCircle, Check, ArrowRightLeft, GraduationCap } from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';
import ConfirmModal from '../../components/modals/ConfirmModal';
import { bookingService } from '../../services/bookingService';
import { roomService } from '../../services/roomService';

import PageSearch from '../../components/ui/PageSearch';
import { canBook, isAdmin } from '../../utils/permissions';

const HistoryView = ({ onClose }) => {
  const { user, bookings, fetchRooms, fetchBookings, fetchAvailability, incomingTransfers, outgoingTransfers, fetchTransfers, pendingTransferCount } = useContext(AppContext);
  const [myOverrides, setMyOverrides] = useState([]);
  const [filterMe] = useState(!isAdmin(user));
  const [timeFilter, setTimeFilter] = useState('UPCOMING'); // UPCOMING, PAST, TRANSFERS
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: '', message: '', action: null });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    setCurrentPage(1);
  }, [timeFilter, searchText]);

  const fetchHistory = async () => {
    if (!user || !isAdmin(user)) return;
    try {
      const overrides = await roomService.getMyAvailability();
      setMyOverrides(overrides);
    } catch (err) {
      setMyOverrides([]);
    }
  };

  useEffect(() => {
    if (isAdmin(user)) {
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
      const matchesFaculty = item.faculty_name?.toLowerCase().includes(search);
      if (!matchesRoom && !matchesClass && !matchesPurpose && !matchesFaculty) return false;
    }

    const bEnd = new Date(item.end_time);
    const bStatus = item.status || 'ACTIVE';

    if (timeFilter !== 'PAST' && !['ACTIVE', 'PENDING', 'CANCELLED', 'FREED', 'BLOCKED'].includes(bStatus)) return false;

    if (timeFilter === 'UPCOMING') return bEnd >= now;
    if (timeFilter === 'PAST') return bEnd < now;

    return true;
  }).sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleCancel = (bookingId, isPending = false, roomName = '') => {
    setConfirmConfig({
      isOpen: true,
      title: isPending ? 'Withdraw Booking Request' : 'Cancel Booking',
      message: isPending 
        ? `Are you sure you want to withdraw your booking request${roomName ? ` for Room ${roomName}` : ''}? The request will be cancelled and will no longer appear in the faculty supervisor's approval queue.`
        : 'Are you sure you want to cancel this booking?',
      confirmText: isPending ? 'Withdraw Request' : 'Cancel Booking',
      confirmType: 'danger',
      action: async () => {
        setLoading(true);
        try {
          await bookingService.cancelBooking(bookingId);
          fetchHistory();
          fetchRooms();
          fetchBookings();
          fetchAvailability();
          toast.success(isPending ? 'Booking request withdrawn' : 'Booking cancelled');
        } catch (err) {
          toast.error(err.message || (isPending ? 'Could not withdraw request' : 'Could not cancel the booking')); // FE-11: tell the user
        } finally {
          setLoading(false);
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden rounded-2xl">
      {/* Streamlined Filter & Search Bar without redundant page title */}
      <div className="p-3 sm:p-4 bg-surface-low border-b border-border-subtle shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="inline-flex w-fit p-1 bg-surface-lowest/70 rounded-xl border border-border-subtle shrink-0">
            {[
              { id: 'UPCOMING', label: 'Upcoming' },
              { id: 'PAST', label: 'Past' },
              { id: 'TRANSFERS', label: 'Transfers' }
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setTimeFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-150 flex items-center gap-1.5 ${
                  timeFilter === f.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f.label}
                {f.id === 'TRANSFERS' && pendingTransferCount > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] rounded-full font-bold ${
                    timeFilter === 'TRANSFERS' ? 'bg-white text-primary' : 'bg-tertiary text-white'
                  }`}>
                    {pendingTransferCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <PageSearch 
              value={searchText} 
              onChange={setSearchText} 
              placeholder="Search bookings..." 
              className="flex-1 sm:w-64"
            />
            {onClose && (
              <button 
                onClick={onClose}
                className="p-2 hover:bg-surface-high rounded-full text-text-secondary hover:text-text-primary transition-colors lg:hidden"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content with smooth animated tab transitions */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 no-scrollbar bg-transparent">
        <div key={timeFilter} className="tab-content-enter space-y-4">
          {timeFilter === 'TRANSFERS' ? (
            <div className="space-y-6">
              {/* Incoming Transfers */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 font-display">
                  <ArrowRightLeft size={16} className="text-secondary"/> Incoming Requests
                </h3>
                {incomingTransfers.length === 0 ? (
                  <div className="p-8 text-center bg-surface-low border border-border-subtle rounded-2xl flex flex-col items-center gap-2">
                    <ArrowRightLeft size={28} className="text-text-secondary/20" />
                    <p className="text-xs text-text-secondary font-medium">No pending inbound transfers</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {incomingTransfers.map(t => (
                      <div key={t.id} className="bg-surface-low border border-border-subtle rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-border transition-all">
                        <div>
                          <p className="font-bold text-text-primary text-base flex items-center gap-2 truncate font-display">
                            {t.room_name} <ArrowRightLeft size={14} className="text-secondary opacity-60 shrink-0"/>
                            <span className="whitespace-nowrap font-semibold text-primary text-sm">{new Date(t.start_time).toLocaleDateString()} @ {new Date(t.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                          </p>
                          <p className="text-xs text-text-secondary font-medium mt-1 truncate">From: {t.requester_name} - {t.new_purpose || 'No purpose provided'}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2 self-end sm:self-auto">
                          {t.status === 'PENDING' && <span className="text-[10px] font-bold bg-tonal-tertiary text-tertiary px-3 py-1 rounded-full">Pending</span>}
                          {t.status === 'REP2_ACCEPTED' && <span className="text-[10px] font-bold bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full">Owner Accepted</span>}
                          {t.status === 'FACULTY2_ACCEPTED' && <span className="text-[10px] font-bold bg-blue-500/20 text-blue-500 px-3 py-1 rounded-full">Slot Released</span>}
                          {t.status === 'ACCEPTED' && <span className="text-[10px] font-bold bg-green-500/10 text-green-500 px-3 py-1 rounded-full">Synchronized</span>}
                          {t.status === 'REJECTED' && <span className="text-[10px] font-bold bg-red-500/10 text-red-500 px-3 py-1 rounded-full">Dismissed</span>}

                          {t.status === 'PENDING' && t.booking_status !== 'CANCELLED' && (
                            <div className="flex gap-1.5 ml-2">
                              <button onClick={() => handleTransferAction(t.id, 'accept')} disabled={loading} className="bg-primary text-white font-semibold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 active:scale-95 transition-all">
                                <Check size={14} /> Accept
                              </button>
                              <button onClick={() => handleTransferAction(t.id, 'reject')} disabled={loading} className="bg-surface-lowest border border-border-subtle text-text-primary font-semibold px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 active:scale-95 transition-all">
                                <X size={14} /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Outgoing Transfers */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2 font-display text-text-secondary">
                  Outgoing Transfers
                </h3>
                {outgoingTransfers.length === 0 ? (
                  <div className="p-8 text-center bg-surface-low border border-border-subtle rounded-2xl flex flex-col items-center gap-2">
                    <ArrowRightLeft size={28} className="text-text-secondary/20" />
                    <p className="text-xs text-text-secondary font-medium">No outbound active requests</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {outgoingTransfers.map(t => (
                      <div key={t.id} className="bg-surface-low border border-border-subtle rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-border transition-all">
                        <div>
                          <p className="font-bold text-text-primary text-base flex items-center gap-2 truncate font-display">
                            {t.room_name} <ArrowRightLeft size={14} className="text-secondary opacity-60 shrink-0"/>
                            <span className="whitespace-nowrap font-semibold text-primary text-sm">{new Date(t.start_time).toLocaleDateString()} @ {new Date(t.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                          </p>
                          <p className="text-xs text-text-secondary font-medium mt-1 truncate">To: {t.owner_name} - {t.new_purpose}</p>
                        </div>
                        <div className="shrink-0 self-end sm:self-auto">
                          {t.status === 'PENDING' && <span className="text-[10px] font-bold bg-tonal-tertiary text-tertiary px-3 py-1 rounded-full">Waiting for Owner</span>}
                          {t.status === 'REP2_ACCEPTED' && <span className="text-[10px] font-bold bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full">Owner Accepted</span>}
                          {t.status === 'FACULTY2_ACCEPTED' && <span className="text-[10px] font-bold bg-blue-500/20 text-blue-500 px-3 py-1 rounded-full">Slot Released</span>}
                          {t.status === 'ACCEPTED' && <span className="text-[10px] font-bold bg-green-500/10 text-green-500 px-3 py-1 rounded-full">Synchronized</span>}
                          {t.status === 'REJECTED' && <span className="text-[10px] font-bold bg-red-500/10 text-red-500 px-3 py-1 rounded-full">Dismissed</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 bg-surface-low border border-border-subtle rounded-2xl flex items-center justify-center text-text-secondary/40 mb-4">
                <Clock size={28} strokeWidth={1.5} />
              </div>
              <h4 className="text-base font-bold text-text-primary tracking-tight mb-1 font-display">Timeline Empty</h4>
              <p className="text-xs text-text-secondary max-w-[280px] leading-relaxed">No matching logs found in this temporal slice.</p>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Desktop View Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-text-secondary text-xs font-semibold uppercase tracking-wider border-b border-border-subtle">
                    <th className="py-2.5 px-4">Room</th>
                    <th className="py-2.5 px-4 text-center">Time</th>
                    <th className="py-2.5 px-4 text-center">Reference</th>
                    <th className="py-2.5 px-4 text-center">Faculty</th>
                    <th className="py-2.5 px-4">Details</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {paginatedHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-low/60 transition-colors border-b border-border-subtle">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${item.type === 'OVERRIDE' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                            {item.type === 'OVERRIDE' ? <Trash2 size={16} strokeWidth={2.5}/> : <Hash size={16} strokeWidth={2.5}/>}
                          </div>
                          <div className="flex flex-col items-start gap-1">
                            <span className="font-bold text-text-primary text-base tracking-tight leading-none font-display">{item.room_name}</span>
                            {(item.status === 'PENDING') && (
                              <span className="px-2 py-0.5 rounded-md bg-tonal-tertiary text-tertiary text-[10px] font-semibold">
                                Pending
                              </span>
                            )}
                            {(item.status === 'ACTIVE' || item.status === 'CONFIRMED' || item.status == null) && item.type === 'BOOKING' && (
                              <span className="px-2 py-0.5 rounded-md bg-green-500/10 text-green-500 text-[10px] font-semibold">
                                Valid
                              </span>
                            )}
                            {(item.status === 'FREED') && (
                              <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary text-[10px] font-semibold">
                                Freed
                              </span>
                            )}
                            {(item.status === 'CANCELLED') && (
                              <span className="px-2 py-0.5 rounded-md bg-red-500/10 text-red-500 text-[10px] font-semibold">
                                Revoked
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className="text-text-primary font-bold text-sm leading-none">
                            {new Date(item.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                          </span>
                          <span className="text-text-secondary text-[11px] font-medium mt-1 leading-none">
                            {new Date(item.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-lowest border border-border-subtle text-text-primary text-xs font-semibold">
                          {item.type === 'OVERRIDE' ? <AlertCircle size={13} className="text-secondary" /> : <User size={13} className="text-primary" />}
                          {item.class_name}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {item.faculty_name ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-surface-lowest border border-border-subtle text-text-secondary text-xs font-semibold">
                            <GraduationCap size={13} className="text-secondary" />
                            {item.faculty_name}
                          </div>
                        ) : (
                          <span className="text-text-secondary opacity-40 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-[200px]">
                        <p className="text-text-secondary text-xs italic line-clamp-2 leading-relaxed">
                          {item.purpose || 'No purpose provided'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {item.type === 'BOOKING' && String(item.created_by) === String(user?.id) && new Date(item.end_time) > now && (
                          item.status === 'PENDING' ? (
                            <button
                              onClick={() => handleCancel(item.id, true, item.room_name)}
                              disabled={loading}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                              title="Withdraw Booking Request"
                              aria-label="Withdraw Booking"
                            >
                              Withdraw
                            </button>
                          ) : (item.status || 'ACTIVE') === 'ACTIVE' ? (
                            <button 
                              onClick={() => handleCancel(item.id, false, item.room_name)}
                              disabled={loading}
                              className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-xl transition-all shadow-sm active:scale-95"
                              aria-label="Cancel Booking"
                            >
                              <Trash2 size={16} />
                            </button>
                          ) : null
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile View Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {paginatedHistory.map((item) => (
                <div key={item.id} className="bg-surface-low border border-border-subtle rounded-2xl p-3.5 space-y-3 shadow-sm hover:border-border transition-all">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${item.type === 'OVERRIDE' ? 'bg-secondary text-white' : 'bg-primary text-white'}`}>
                        {item.type === 'OVERRIDE' ? <Trash2 size={18} strokeWidth={2.5}/> : <Hash size={18} strokeWidth={2.5}/>}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-text-primary text-base truncate font-display capitalize leading-tight">{item.room_name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {(item.status === 'PENDING') && (
                            <span className="text-[10px] font-semibold text-tertiary bg-tonal-tertiary px-2 py-0.5 rounded-md inline-block">Pending</span>
                          )}
                          {(item.status === 'ACTIVE' || item.status === 'CONFIRMED' || item.status == null) && item.type === 'BOOKING' && (
                            <span className="text-[10px] font-semibold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-md inline-block">Valid</span>
                          )}
                          {(item.status === 'FREED') && (
                            <span className="text-[10px] font-semibold text-primary bg-primary/20 px-2 py-0.5 rounded-md inline-block">Freed</span>
                          )}
                          {(item.status === 'CANCELLED') && (
                            <span className="text-[10px] font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-md inline-block">Revoked</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {item.type === 'BOOKING' && String(item.created_by) === String(user?.id) && new Date(item.end_time) > now && (
                      item.status === 'PENDING' ? (
                        <button
                          onClick={() => handleCancel(item.id, true, item.room_name)}
                          disabled={loading}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shrink-0 active:scale-95"
                          aria-label="Withdraw Booking"
                        >
                          Withdraw
                        </button>
                      ) : (item.status || 'ACTIVE') === 'ACTIVE' ? (
                        <button 
                          onClick={() => handleCancel(item.id, false, item.room_name)}
                          disabled={loading}
                          className="p-2 text-red-500 hover:text-white hover:bg-red-500 rounded-xl transition-all shrink-0"
                          aria-label="Cancel Booking"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 text-xs">
                     <div className={`px-2.5 py-1 rounded-lg text-white font-medium ${item.type === 'OVERRIDE' ? 'bg-secondary' : 'bg-primary'}`}>
                       {new Date(item.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
                     </div>
                     <div className="px-2.5 py-1 rounded-lg bg-surface-lowest border border-border-subtle text-text-primary font-medium">
                       {new Date(item.start_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                     </div>
                     <div className="px-2.5 py-1 rounded-lg bg-surface-lowest border border-border-subtle text-text-secondary font-medium flex items-center gap-1.5">
                       {item.type === 'OVERRIDE' ? <AlertCircle size={12} /> : <User size={12} />} {item.class_name}
                     </div>
                     {item.faculty_name && (
                       <div className="px-2.5 py-1 rounded-lg bg-surface-lowest border border-border-subtle text-text-secondary font-medium flex items-center gap-1.5">
                         <GraduationCap size={12} className="text-secondary" /> {item.faculty_name}
                       </div>
                     )}
                  </div>

                  {item.purpose && (
                    <p className="text-xs text-text-secondary italic leading-relaxed bg-surface-lowest/60 border border-border-subtle/50 p-2.5 rounded-xl font-medium">
                      "{item.purpose}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 bg-surface-low rounded-xl border border-border-subtle mt-4 font-display">
            <span className="text-xs font-semibold text-text-secondary">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button 
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-3 py-1.5 bg-surface-lowest rounded-lg text-xs font-semibold border border-border-subtle hover:bg-surface-high transition-all disabled:opacity-30 disabled:cursor-not-allowed text-text-primary"
              >
                Prev
              </button>
              <button 
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-all shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
        </div>
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

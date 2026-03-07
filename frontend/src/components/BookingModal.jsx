import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, Wind, Monitor } from 'lucide-react';
import { api } from '../utils/api';

const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM to 5 PM

function BookingModal({ slot, rooms, bookings, availability, onClose, onSuccess }) {
  const [selectedRoom, setSelectedRoom] = useState(slot?.room_id || '');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [isSemester, setIsSemester] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  React.useEffect(() => {
    if (searchTerm.length < 2) {
      setDebouncedTerm('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [bookingType, setBookingType] = useState('EXTRA'); // 'EXTRA' | 'RESCHEDULE'
  const [rescheduleRoom, setRescheduleRoom] = useState('');
  const [rescheduleDay, setRescheduleDay] = useState(slot.day);
  const [rescheduleHour, setRescheduleHour] = useState(slot.hour);

  const selectedRoomData = rooms.find(r => String(r.id) === String(selectedRoom));

  const getRoomBooking = (roomId) => {
    return bookings?.find(b => {
      const bStatus = b.status || 'ACTIVE';
      if (bStatus !== 'ACTIVE') return false;
      const bStart = new Date(b.start_time);
      const bHour = bStart.getHours();
      
      // Compare absolute dates for cross-week accuracy
      const bDateStr = bStart.toDateString();
      const slotDateStr = new Date(slot.date).toDateString();
      
      return bDateStr === slotDateStr && bHour === slot.hour && b.room_id === roomId;
    });
  };

  const handleCancel = async () => {
    const booking = getRoomBooking(selectedRoom);
    if (!booking) return;

    setLoading(true);
    try {
      const res = await api.patch(`/bookings/${booking.id}/cancel`);
      if (res.ok) {
        onSuccess();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRoom) return setError('Please select a room');
    if (bookingType === 'RESCHEDULE' && !rescheduleRoom) return setError('Please specify the room being freed up');
    
    setLoading(true);
    setError('');

    // Use a fresh date instance to avoid mutating the source date from props
    const targetDate = new Date(slot.date);
    targetDate.setHours(slot.hour, 0, 0, 0);
    
    const start_time = targetDate.toISOString();
    
    // Calculate end time separately to preserve targetDate
    const endDate = new Date(targetDate);
    endDate.setHours(slot.hour + 1);
    const end_time = endDate.toISOString();

    const endpoint = isSemester ? '/bookings/semester' : '/bookings';

    try {
      const res = await api.post(endpoint, {
        room_id: selectedRoom,
        start_time,
        end_time,
        purpose: bookingType === 'RESCHEDULE' ? `Reschedule: ${purpose}` : purpose,
        is_semester: isSemester,
        reschedule_room_name: bookingType === 'RESCHEDULE' ? rescheduleRoom : null,
        reschedule_day: bookingType === 'RESCHEDULE' ? rescheduleDay : null,
        reschedule_hour: bookingType === 'RESCHEDULE' ? rescheduleHour : null
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        setError(data.error || 'Booking failed');
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
      
      <div className="relative w-full max-w-xl glass dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl border border-black/5">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
          <X size={24} />
        </button>

        <h3 className="text-2xl font-bold text-text-primary mb-2 flex items-center gap-4">
          Book Room
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-accent/10 text-accent capitalize">
            {slot.day} @ {slot.hour}:00
          </span>
        </h3>
        <p className="text-text-secondary mb-6 text-sm">Secure your slot in one of the available rooms.</p>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-sm flex items-center gap-3 font-medium">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-text-primary">Select Room</label>
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      placeholder={selectedRoomData ? selectedRoomData.name : "Select a room..."}
                      value={searchTerm}
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all pr-10 shadow-sm cursor-pointer hover:bg-bg-secondary/30"
                    />
                    <div 
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  </div>

                  {isDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
                      {rooms
                        .filter(room => {
                          const av = availability?.find(a => a.room_id === room.id && a.day === slot.day && a.hour === slot.hour);
                          const matchesSearch = !debouncedTerm || room.name.toLowerCase().includes(debouncedTerm.toLowerCase()) || room.building?.toLowerCase().includes(debouncedTerm.toLowerCase());
                          return (av ? av.is_available : true) && matchesSearch;
                        })
                        .map(room => {
                          const booking = getRoomBooking(room.id);
                          const facilities = [room.has_projector ? '🎥' : '', room.has_ac ? '❄️' : ''].filter(Boolean).join(' ');
                          const isSelected = String(selectedRoom) === String(room.id);
                          
                          return (
                            <div
                              key={room.id}
                              onClick={() => {
                                if (!booking) {
                                  setSelectedRoom(room.id);
                                  setIsDropdownOpen(false);
                                  setSearchTerm('');
                                }
                              }}
                              className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center justify-between ${booking ? 'opacity-50 cursor-not-allowed bg-bg-primary/50' : 'hover:bg-accent/5'} ${isSelected ? 'bg-accent/10 border-l-4 border-l-accent' : ''}`}
                            >
                              <div className="flex flex-col gap-0.5 max-w-[70%]">
                                <span className="font-bold text-base text-text-primary truncate flex items-center gap-2">
                                  {room.name}
                                </span>
                                <span className="text-xs text-text-secondary truncate font-medium">{room.building}</span>
                                {booking && (
                                  <span className="text-sm text-red-600 font-black italic bg-red-50 px-2 py-0.5 rounded-md mt-1 w-fit">
                                    Occupied by {booking.user_name}
                                  </span>
                                )}
                              </div>
                               <div className="flex gap-2 items-center opacity-80">
                                 {room.has_ac && <Wind size={14} className="text-accent" />}
                                 {room.has_projector && <Monitor size={14} className="text-accent" />}
                               </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-text-primary">Booking Type</label>
                <div className="relative">
                  <select 
                    value={bookingType}
                    onChange={(e) => setBookingType(e.target.value)}
                    className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm font-medium text-text-primary focus:outline-none focus:border-accent transition-all appearance-none cursor-pointer shadow-sm pr-10 hover:bg-bg-secondary/30"
                  >
                    <option value="EXTRA">Extra Booking</option>
                    <option value="RESCHEDULE">Reschedule</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                </div>
              </div>
            </div>

            {bookingType === 'RESCHEDULE' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 bg-bg-primary/50 p-4 rounded-xl border border-border shadow-inner">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Day to free up</label>
                     <div className="relative">
                       <select 
                         value={rescheduleDay}
                         onChange={(e) => setRescheduleDay(e.target.value)}
                         className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-medium text-text-primary focus:outline-none focus:border-accent shadow-sm appearance-none cursor-pointer pr-8 hover:bg-bg-primary/50"
                       >
                         {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => <option key={d} value={d}>{d}</option>)}
                       </select>
                       <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50 pointer-events-none">
                         <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                       </div>
                     </div>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Slot to free up</label>
                     <div className="relative">
                       <select 
                         value={rescheduleHour}
                         onChange={(e) => setRescheduleHour(parseInt(e.target.value))}
                         className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-medium text-text-primary focus:outline-none focus:border-accent shadow-sm appearance-none cursor-pointer pr-8 hover:bg-bg-primary/50"
                       >
                         {HOURS.map(h => <option key={h} value={h}>{h}:00</option>)}
                       </select>
                       <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50 pointer-events-none">
                         <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                       </div>
                     </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-bold text-text-primary">Which room is being freed up?</label>
                  <input
                    type="text"
                    placeholder="e.g. 5115"
                    value={rescheduleRoom}
                    onChange={(e) => setRescheduleRoom(e.target.value)}
                    className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent transition-all shadow-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 p-4 bg-accent/5 rounded-xl border border-accent/20">
                <input 
                    type="checkbox" 
                    id="semesterBooking"
                    checked={isSemester}
                    onChange={(e) => setIsSemester(e.target.checked)}
                    className="w-5 h-5 rounded border-accent text-accent focus:ring-accent"
                />
                <label htmlFor="semesterBooking" className="text-sm font-bold text-text-primary cursor-pointer leading-tight">
                    Book for entire semester (15 weeks)
                    <p className="text-[10px] text-accent/70 font-medium mt-0.5">Requires all slots to be free across weeks.</p>
                </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider">Purpose Details</label>
            <textarea 
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Special Class, Club Meeting"
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all h-20 resize-none placeholder:text-text-secondary/40 shadow-sm"
            />
          </div>

          <div className="flex gap-4 pt-2">
              <button 
                type="submit" 
                disabled={loading}
                className="flex-[2] flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-xl text-base font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
              >
                {loading ? 'Processing...' : (
                  <>
                    <CheckCircle size={20} />
                    Confirm Booking
                  </>
                )}
              </button>
              {selectedRoom && getRoomBooking(selectedRoom) && String(getRoomBooking(selectedRoom).created_by) === String(JSON.parse(localStorage.getItem('user'))?.id) && (
                  <button 
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 border-2 border-red-100 text-red-600 hover:bg-red-50 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-3"
                >
                  <X size={20} />
                  Cancel
                </button>
              )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;

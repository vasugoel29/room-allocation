import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

function BookingModal({ slot, rooms, bookings, availability, onClose, onSuccess }) {
  const [selectedRoom, setSelectedRoom] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [isSemester, setIsSemester] = useState(false);

  const getRoomBooking = (roomId) => {
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
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
      const res = await fetch(`http://localhost:4000/api/bookings/${booking.id}/cancel`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || 'Cancellation failed');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRoom) return setError('Please select a room');
    
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

    const endpoint = isSemester ? 'http://localhost:4000/api/bookings/semester' : 'http://localhost:4000/api/bookings';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          room_id: selectedRoom,
          start_time,
          end_time,
          purpose,
          is_semester: isSemester
        })
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        setError(data.error || 'Booking failed');
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/40 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-lg glass rounded-3xl p-8 shadow-2xl border border-black/5">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-black/5 rounded-full text-slate-400 hover:text-slate-900 transition-colors">
          <X size={24} />
        </button>

        <h3 className="text-2xl font-bold text-slate-900 mb-2 flex items-center gap-3">
          Book Room
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 capitalize">
            {slot.day} @ {slot.hour}:00
          </span>
        </h3>
        <p className="text-slate-500 mb-8">Secure your slot in one of the available rooms.</p>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-3 font-medium">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Select Room</label>
              <div className="relative">
                <select 
                  value={selectedRoom} 
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all appearance-none pr-10"
                >
                  <option value="" className="bg-white">Choose a room...</option>
                  {rooms
                    .filter(room => {
                      const av = availability?.find(a => a.room_id === room.id && a.day === slot.day && a.hour === slot.hour);
                      return av ? av.is_available : true;
                    })
                    .map(room => {
                      const booking = getRoomBooking(room.id);
                      const facilities = [room.has_projector ? '🎥' : '', room.has_ac ? '❄️' : ''].filter(Boolean).join(' ');
                      return (
                        <option key={room.id} value={room.id} className="bg-white" disabled={!!booking}>
                          {room.name} {facilities} | {room.capacity} seats ({room.building})
                          {booking ? ` - Booked by ${booking.user_name}` : ''}
                        </option>
                      );
                    })}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                <input 
                    type="checkbox" 
                    id="semesterBooking"
                    checked={isSemester}
                    onChange={(e) => setIsSemester(e.target.checked)}
                    className="w-5 h-5 rounded-lg border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="semesterBooking" className="text-sm font-medium text-indigo-900 cursor-pointer">
                    Book for entire semester (15 weeks)
                    <p className="text-[10px] text-indigo-600/70 font-normal">Requires all slots to be free across weeks.</p>
                </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Purpose</label>
            <textarea 
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Special Class, Club Meeting"
              className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all h-24 resize-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex gap-3">
              <button 
                type="submit" 
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
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
                  className="px-6 border-2 border-red-100 text-red-600 hover:bg-red-50 rounded-2xl font-bold transition-all flex items-center gap-2"
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

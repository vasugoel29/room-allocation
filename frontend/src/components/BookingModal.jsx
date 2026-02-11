import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

function BookingModal({ slot, rooms, bookings, availability, onClose, onSuccess }) {
  const [selectedRoom, setSelectedRoom] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const getRoomBooking = (roomId) => {
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    return bookings?.find(b => {
      const bStart = new Date(b.start_time);
      const bDayIndex = bStart.getDay();
      const bHour = bStart.getHours();
      return bDayIndex === dayMap[slot.day] && bHour === slot.hour && b.room_id === roomId;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRoom) return setError('Please select a room');
    
    setLoading(true);
    setError('');

    // Construct start/end time based on slot day and hour
    const dayMap = { 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const date = new Date();
    const currentDay = date.getDay() || 7;
    const targetDay = dayMap[slot.day];
    const diff = targetDay - currentDay;
    
    const targetDate = new Date();
    targetDate.setDate(date.getDate() + diff);
    
    const start_time = new Date(targetDate.setHours(slot.hour, 0, 0, 0)).toISOString();
    const end_time = new Date(targetDate.setHours(slot.hour + 1, 0, 0, 0)).toISOString();

    try {
      const res = await fetch('http://localhost:4000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          room_id: selectedRoom,
          start_time,
          end_time,
          purpose
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
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Select Room</label>
            <div className="relative">
              <select 
                value={selectedRoom} 
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all appearance-none pr-10"
              >
                <option value="" className="bg-white">Choose a room...</option>
                {rooms.map(room => {
                  const booking = getRoomBooking(room.id);
                  return (
                    <option key={room.id} value={room.id} className="bg-white" disabled={!!booking}>
                      {room.name} ({room.capacity} seats, {room.building})
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

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Purpose</label>
            <textarea 
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Special Class, Club Meeting"
              className="w-full bg-black/5 border border-black/5 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-all h-24 resize-none placeholder:text-slate-400"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/20 mt-4 active:scale-[0.98]"
          >
            {loading ? 'Processing...' : (
              <>
                <CheckCircle size={20} />
                Confirm Booking
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;

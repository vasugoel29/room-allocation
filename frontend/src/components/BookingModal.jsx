import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

function BookingModal({ slot, rooms, bookings, onClose, onSuccess }) {
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
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-lg glass rounded-3xl p-8 shadow-2xl border border-white/10">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
          <X size={24} />
        </button>

        <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
          Book Room
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 capitalize">
            {slot.day} @ {slot.hour}:00
          </span>
        </h3>
        <p className="text-slate-400 mb-8">Secure your slot in one of the available rooms.</p>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Select Room</label>
            <select 
              value={selectedRoom} 
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none"
            >
              <option value="" className="bg-slate-900">Choose a room...</option>
              {rooms.map(room => {
                const booking = getRoomBooking(room.id);
                return (
                  <option key={room.id} value={room.id} className="bg-slate-900" disabled={!!booking}>
                    {room.name} ({room.capacity} seats, {room.building})
                    {booking ? ` - Booked by ${booking.user_name}` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-300">Purpose</label>
            <textarea 
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Special Class, Club Meeting"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-colors h-24 resize-none"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 mt-4"
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

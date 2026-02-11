import React from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8 AM to 6 PM

function Calendar({ bookings, rooms, onSlotClick }) {
  const getBooking = (day, hour, roomId) => {
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    return bookings.find(b => {
      const bStart = new Date(b.start_time);
      const bDayIndex = bStart.getDay();
      const bHour = bStart.getHours();
      return bDayIndex === dayMap[day] && bHour === hour && b.room_id === roomId;
    });
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="grid grid-cols-[100px_repeat(6,1fr)] border-b border-white/10">
          <div className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</div>
          {DAYS.map(day => (
            <div key={day} className="p-4 text-center text-sm font-bold text-white border-l border-white/10">
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="relative">
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-[100px_repeat(6,1fr)] group">
              <div className="p-4 text-xs font-medium text-slate-400 border-r border-white/10 flex items-center justify-center bg-white/[0.02]">
                {hour}:00
              </div>
              {DAYS.map(day => (
                <div 
                  key={day} 
                  className="p-1 border-b border-l border-white/10 min-h-[80px] hover:bg-white/[0.03] transition-colors cursor-pointer relative"
                  onClick={() => onSlotClick({ day, hour })}
                >
                  <div className="flex flex-col gap-1">
                    {rooms.slice(0, 3).map(room => { // Limit to 3 rooms in summary view or handle better
                      const booking = getBooking(day, hour, room.id);
                      return (
                        <div 
                          key={room.id} 
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            booking 
                              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 font-medium' 
                              : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-500/60'
                          }`}
                        >
                          {room.name}: {booking ? `Booked by ${booking.user_name}` : 'Available'}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Calendar;

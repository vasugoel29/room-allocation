import { Filter } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM to 5 PM

function Calendar({ bookings, rooms, availability, filters, onSlotClick }) {
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
        <div className="grid grid-cols-[100px_repeat(6,1fr)] border-b border-black/5">
          <div className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Time</div>
          {DAYS.map(day => (
            <div key={day} className="p-4 text-center text-sm font-bold text-slate-800 border-l border-black/5">
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="relative">
          {rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-b-2xl">
              <div className="bg-white p-4 rounded-full shadow-sm border border-black/5 mb-4">
                <Filter className="text-slate-300" size={32} />
              </div>
              <p className="text-slate-500 font-medium">No rooms match your filters</p>
              <p className="text-slate-400 text-xs mt-1">Try adjusting the capacity or features</p>
            </div>
          ) : (
            HOURS.map(hour => (
              <div key={hour} className="grid grid-cols-[100px_repeat(6,1fr)] group">
                <div className="p-4 text-xs font-medium text-slate-400 border-r border-black/5 flex items-center justify-center bg-black/[0.01]">
                  {hour}:00
                </div>
                {DAYS.map(day => (
                  <div 
                    key={day} 
                    className="p-1 border-b border-l border-black/5 min-h-[64px] hover:bg-black/[0.01] transition-colors cursor-pointer relative"
                    onClick={() => onSlotClick({ day, hour })}
                  >
                    <div className="flex flex-col gap-1">
                      {rooms
                        .filter(room => {
                          const av = availability?.find(a => a.room_id === room.id && a.day === day && a.hour === hour);
                          return av ? av.is_available : true;
                        })
                        .sort((a, b) => {
                          const score = (r) => (r.has_ac ? 10 : 0) + (r.has_projector ? 5 : 0) + (r.capacity / 10);
                          return score(b) - score(a);
                        })
                        .slice(0, 3).map(room => { 
                          const booking = getBooking(day, hour, room.id);
                          let bgColor = 'bg-white border-slate-200 text-slate-600 shadow-sm';
                          let textColor = 'text-white';

                          if (room.has_ac && room.has_projector) {
                            bgColor = booking ? 'bg-violet-900 border-violet-950 shadow-inner' : 'bg-violet-500 border-violet-600';
                          } else if (room.has_ac) {
                            bgColor = booking ? 'bg-blue-900 border-blue-950 shadow-inner' : 'bg-blue-500 border-blue-600';
                          } else if (room.has_projector) {
                            bgColor = booking ? 'bg-amber-900 border-amber-950 shadow-inner' : 'bg-amber-500 border-amber-600';
                          } else if (booking) {
                            bgColor = 'bg-slate-800 border-slate-900 shadow-inner';
                          } else {
                            textColor = 'text-slate-600';
                          }

                          return (
                            <div 
                              key={room.id} 
                              className={`text-[9px] px-1.5 py-1 rounded-md border transition-all truncate hover:brightness-105 active:scale-95 ${bgColor} ${textColor} ${booking ? 'opacity-90' : 'font-medium'}`}
                            >
                              <span className={booking ? 'font-normal italic' : 'font-bold'}>{room.name}</span>
                              <span className="ml-1 opacity-90 text-[8px]">
                                {booking ? `(${booking.user_name})` : `(${room.capacity})`}
                              </span>
                            </div>
                          );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default Calendar;

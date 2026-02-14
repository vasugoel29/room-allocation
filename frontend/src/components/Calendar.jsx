import { Filter } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM to 5 PM

function Calendar({ bookings, rooms, availability, filters, onSlotClick }) {
  const getCurrentWeekDates = () => {
    const now = new Date();
    const currentDay = now.getDay() || 7;
    
    // If today is Saturday (6) or Sunday (7/0), shift to next week (Monday)
    const offset = currentDay >= 6 ? 7 : 0;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() - currentDay + 1 + offset);
    
    return DAYS.map((day, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return { 
        day, 
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date
      };
    });
  };
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
    <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-250px)]">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="grid grid-cols-[100px_repeat(5,1fr)] border-b border-black/5 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-sm">
          <div className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-center bg-slate-50/50">Time</div>
          {getCurrentWeekDates().map(({ day, date }) => (
            <div key={day} className="p-4 text-center border-l border-black/5 flex flex-col gap-0.5">
              <span className="text-sm font-bold text-slate-800">{day}</span>
              <span className="text-[10px] text-slate-400 font-medium">{date}</span>
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
              <div key={hour} className="grid grid-cols-[100px_repeat(5,1fr)] group">
                <div className="p-4 text-xs font-medium text-slate-400 border-r border-black/5 flex items-center justify-center bg-black/[0.01]">
                  {hour}:00
                </div>
                {DAYS.map(day => (
                  <div 
                    key={day} 
                    className="p-1 border-b border-l border-black/5 min-h-[64px] hover:bg-black/[0.01] transition-colors cursor-pointer relative"
                    onClick={() => {
                      const weekDates = getCurrentWeekDates();
                      const dateObj = weekDates.find(d => d.day === day)?.fullDate;
                      onSlotClick({ day, hour, date: dateObj });
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      {rooms
                        .filter(room => {
                          const av = availability?.find(a => a.room_id === room.id && a.day === day && a.hour === hour);
                          const booking = getBooking(day, hour, room.id);
                          return (av ? av.is_available : true) && !booking;
                        })
                        .sort((a, b) => {
                          const score = (r) => (r.has_ac ? 10 : 0) + (r.has_projector ? 5 : 0) + (r.capacity / 10);
                          return score(b) - score(a);
                        })
                        .slice(0, 2).map(room => { 
                          const booking = getBooking(day, hour, room.id);
                          const bgColor = booking ? 'bg-slate-100 border-slate-200 text-slate-400 shadow-inner opacity-70' : 'bg-white border-slate-200 text-slate-600 shadow-sm';
                          const textColor = booking ? 'text-slate-400' : 'text-slate-600';

                          return (
                            <div 
                              key={room.id} 
                              className={`text-[9px] px-1.5 py-1 rounded-md border transition-all truncate hover:brightness-105 active:scale-95 ${bgColor} ${textColor} ${booking ? '' : 'font-medium'}`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className={booking ? 'font-normal italic' : 'font-bold'}>{room.name}</span>
                                <div className="flex gap-0.5 opacity-80">
                                  {room.has_projector && <span>🎥</span>}
                                  {room.has_ac && <span>❄️</span>}
                                </div>
                              </div>
                              <span className="opacity-90 text-[8px]">
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

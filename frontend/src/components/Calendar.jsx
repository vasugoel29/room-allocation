import React, { useState, useEffect } from 'react';
import { Filter, Wind, Monitor } from 'lucide-react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM to 5 PM

function Calendar({ bookings, rooms, availability, viewMode, selectedDay, onDayChange, onSlotClick }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update every minute
    return () => clearInterval(timer);
  }, []);

  const getCurrentTimePosition = () => {
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const dayIndex = now.getDay(); // 0 is Sunday, 1 is Monday...
    const currentDayName = DAYS[dayIndex - 1];

    if (hour < 8 || hour >= 18 || dayIndex === 0 || dayIndex === 6) return null;
    
    // Position relative to the 10-hour grid (8 AM to 5 PM+)
    const totalMinutesSince8AM = (hour - 8) * 60 + minutes;
    const percentage = (totalMinutesSince8AM / (10 * 60)) * 100;
    
    return { percentage, day: currentDayName };
  };

  const timePos = getCurrentTimePosition();

  const getCurrentWeekDates = () => {
    const currentDay = now.getDay() || 7;
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

  const weekDates = getCurrentWeekDates();
  const displayDays = viewMode === 'day' ? [selectedDay] : DAYS;

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
    <div className="flex flex-col flex-1 overflow-hidden w-full relative">
      {viewMode === 'day' && (
        <div className="flex gap-2 p-2 mb-2 bg-black/5 rounded-xl self-center">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => onDayChange(day)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedDay === day ? 'bg-accent text-white shadow-md' : 'text-text-secondary hover:bg-bg-secondary/50'}`}
            >
              {day}
            </button>
          ))}
        </div>
      )}
      
      <div className="overflow-x-auto overflow-y-auto flex-1 w-full">
        <div className={`flex flex-col min-h-full w-full relative ${viewMode === 'day' ? '' : 'min-w-[800px]'}`}>
          {/* Header */}
          <div className={`grid border-b border-border bg-bg-secondary/90 backdrop-blur-md sticky top-0 z-30 shadow-sm ${viewMode === 'day' ? 'grid-cols-[120px_1fr]' : 'grid-cols-[120px_repeat(5,1fr)]'}`}>
            <div className="p-4 text-base font-bold text-text-secondary uppercase tracking-widest flex items-center justify-center bg-bg-primary/50">Time</div>
            {weekDates.filter(d => displayDays.includes(d.day)).map(({ day, date }) => (
              <div key={day} className="p-4 text-center border-l border-border flex flex-col gap-1">
                <span className="text-2xl font-black text-text-primary uppercase tracking-tighter">{day}</span>
                <span className="text-sm text-text-secondary font-bold">{date}</span>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="relative flex-1 flex flex-col w-full">
            {/* Current Time Line */}
            {timePos && (
              <div 
                className="absolute left-0 right-0 z-20 pointer-events-none transition-all duration-1000"
                style={{ top: `${timePos.percentage}%` }}
              >
                <div className="flex items-center w-full">
                  <div className="w-[120px] flex justify-end pr-2">
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex-1 h-[2px] bg-red-500 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                  </div>
                </div>
              </div>
            )}

            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-bg-primary/50 flex-1">
                <div className="bg-bg-secondary p-4 rounded-full shadow-sm border border-border mb-4">
                  <Filter className="text-text-secondary/30" size={32} />
                </div>
                <p className="text-text-secondary text-lg font-medium">No rooms match your filters</p>
                <p className="text-text-secondary/60 text-sm mt-1">Try adjusting the capacity or features</p>
              </div>
            ) : (
              HOURS.map(hour => (
                <div key={hour} className={`flex-1 grid group border-b border-border last:border-b-0 ${viewMode === 'day' ? 'grid-cols-[120px_1fr]' : 'grid-cols-[120px_repeat(5,1fr)]'}`}>
                  <div className="p-4 text-lg font-black text-text-secondary uppercase border-r border-border flex items-center justify-center bg-bg-primary/10">
                    {hour}:00
                  </div>
                  {displayDays.map(day => (
                    <div 
                      key={day} 
                      className="p-1 border-l border-border hover:bg-bg-primary/30 transition-colors cursor-pointer relative h-full min-h-[80px]"
                      onClick={() => {
                        const dateObj = weekDates.find(d => d.day === day)?.fullDate;
                        onSlotClick({ day, hour, date: dateObj });
                      }}
                    >
                      <div className="flex flex-col gap-2 p-1 h-full overflow-hidden">
                          {rooms
                          .filter(room => {
                            const avNode = availability?.find(a => a.room_id === room.id && a.day === day && a.hour === hour);
                            return avNode ? avNode.is_available : true;
                          })
                          .sort((a, b) => {
                            const aBooked = !!getBooking(day, hour, a.id);
                            const bBooked = !!getBooking(day, hour, b.id);
                            
                            // 1. Unbooked first
                            if (aBooked !== bBooked) return aBooked ? 1 : -1;
                            
                            // 2. Score (AC, Projector, Capacity)
                            const score = (r) => (r.has_ac ? 10 : 0) + (r.has_projector ? 5 : 0) + (r.capacity / 10);
                            return score(b) - score(a);
                          })
                          .slice(0, 2).map(room => { 
                            const booking = getBooking(day, hour, room.id);
                            return (
                              <div 
                                key={room.id}
                                className={`px-3 py-2 rounded-xl border shadow-sm hover:translate-y-[-1px] transform transition-all text-base leading-tight truncate flex items-center justify-between font-black border-border ${booking ? 'bg-bg-primary opacity-60 grayscale-[0.3]' : 'bg-bg-secondary text-text-primary'}`}
                                title={`${room.name}${booking ? ` - Booked by ${booking.user_name}` : ''}`}
                              >
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <span className={`font-black truncate ${booking ? 'text-text-secondary' : ''}`}>{room.name}</span>
                                </div>
                                <div className="flex flex-col items-center gap-1 ml-2 flex-shrink-0 opacity-80">
                                  <Wind size={12} className={room.has_ac ? (booking ? 'text-text-secondary/50' : 'text-accent') : 'text-red-500'} />
                                  <Monitor size={12} className={room.has_projector ? (booking ? 'text-text-secondary/50' : 'text-accent') : 'text-red-500'} />
                                </div>
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
    </div>
  );
}

export default Calendar;

import React, { useState, useEffect, useContext } from 'react';
import { Filter, Wind, Monitor } from 'lucide-react';
import { AppContext } from '../context/AppContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); 

function Calendar({ onSlotClick }) {
  const { bookings, rooms, availability, viewMode, setViewMode, selectedDay, setSelectedDay } = useContext(AppContext);
  const onDayChange = setSelectedDay;
  const [now, setNow] = useState(new Date());

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getCurrentTimePosition = () => {
    const hour = now.getHours();
    const minutes = now.getMinutes();
    const dayIndex = now.getDay();
    const currentDayName = DAYS[dayIndex - 1];

    if (hour < 8 || hour >= 18 || dayIndex === 0 || dayIndex === 6) return null;
    
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
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const dayNum = String(date.getDate()).padStart(2, '0');
      return { 
        day, 
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullDate: date,
        dateStr: `${year}-${month}-${dayNum}`
      };
    });
  };

  const weekDates = getCurrentWeekDates();
  const displayDays = viewMode === 'day' ? [selectedDay] : weekDates.map(d => d.dateStr);

  const getBooking = (dateStr, hour, roomId) => {
    return bookings.find(b => {
      const bStatus = b.status || 'ACTIVE';
      if (bStatus !== 'ACTIVE') return false;
      const bStart = new Date(b.start_time);
      const bYear = bStart.getFullYear();
      const bMonth = String(bStart.getMonth() + 1).padStart(2, '0');
      const bDate = String(bStart.getDate()).padStart(2, '0');
      const bLocalStr = `${bYear}-${bMonth}-${bDate}`;
      const bHour = bStart.getHours();
      return bLocalStr === dateStr && bHour === hour && b.room_id === roomId;
    });
  };

  const pillDensity = isMobile 
    ? (viewMode === 'day' ? 4 : 2) 
    : (viewMode === 'day' ? 12 : 2);

  return (
    <div className="flex flex-col flex-1 overflow-hidden w-full relative">
      <div className="overflow-x-auto overflow-y-auto flex-1 w-full no-scrollbar rounded-xl border border-border">
        <div className={`flex flex-col min-h-full w-full relative layout-transition ${viewMode === 'day' ? 'min-w-[320px]' : 'min-w-[800px]'}`}>
          <div className={`grid border-b border-border bg-bg-secondary/90 backdrop-blur-md sticky top-0 z-30 shadow-sm layout-transition ${viewMode === 'day' ? 'grid-cols-[50px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-[50px_repeat(5,1fr)] sm:grid-cols-[120px_repeat(5,1fr)]'}`}>
            <div className="p-2 sm:p-4 text-[10px] sm:text-base font-bold text-text-secondary uppercase tracking-widest flex items-center justify-center bg-bg-primary/50">Time</div>
            {weekDates.filter(d => displayDays.includes(d.dateStr)).map(({ dateStr, day, date }) => (
              <div 
                key={dateStr} 
                className={`p-2 sm:p-4 text-center border-l border-border flex flex-col gap-0.5 sm:gap-1 layout-transition ${viewMode === 'week' ? 'cursor-pointer hover:bg-accent/5 active:bg-accent/10 transition-colors' : ''}`}
                onClick={() => {
                  if (viewMode === 'week') {
                    onDayChange(dateStr);
                    setViewMode('day');
                  }
                }}
              >
                <span className="text-lg sm:text-2xl font-black text-text-primary uppercase tracking-tighter leading-none">{day}</span>
                <span className="text-[10px] sm:text-sm text-text-secondary font-bold leading-none">{date}</span>
              </div>
            ))}
          </div>

          <div className="relative flex-1 flex flex-col w-full">
            {timePos && (
              <div 
                className="absolute left-0 right-0 z-20 pointer-events-none transition-all duration-1000"
                style={{ top: `${timePos.percentage}%` }}
              >
                <div className="flex items-center w-full">
                  <div className="w-[50px] sm:w-[120px] flex justify-end pr-1 sm:pr-2">
                    <span className="bg-red-500 text-white text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex-1 h-[1px] sm:h-[2px] bg-red-500 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 sm:w-3 sm:h-3 bg-red-500 rounded-full border border-white shadow-sm"></div>
                  </div>
                </div>
              </div>
            )}

            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-bg-primary/50 flex-1">
                <div className="bg-bg-secondary p-4 rounded-full shadow-sm border border-border mb-4">
                  <Filter className="text-text-secondary/30" size={32} />
                </div>
                <p className="text-text-secondary text-base sm:text-lg font-medium">No rooms found</p>
              </div>
            ) : (
              HOURS.map(hour => (
                <div key={hour} className={`flex-1 grid group border-b border-border last:border-b-0 layout-transition ${viewMode === 'day' ? 'grid-cols-[50px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-[50px_repeat(5,1fr)] sm:grid-cols-[120px_repeat(5,1fr)]'}`}>
                  <div className="p-2 sm:p-4 text-xs sm:text-lg font-black text-text-secondary uppercase border-r border-border flex items-center justify-center bg-bg-primary/10 transition-all">
                    {hour}:00
                  </div>
                  {displayDays.map(dateStr => {
                    const currentWeekDay = weekDates.find(d => d.dateStr === dateStr);
                    const dayLabel = currentWeekDay ? currentWeekDay.day : 'Unknown';
                    
                    return (
                    <div 
                      key={dateStr} 
                      className="p-1 border-l border-border hover:bg-bg-primary/30 transition-colors cursor-pointer relative h-full min-h-[70px] sm:min-h-[80px]"
                      onClick={() => {
                        const dateObj = currentWeekDay?.fullDate;
                        onSlotClick({ day: dayLabel, hour, date: dateObj });
                      }}
                    >
                      <div className={`p-1.5 h-full overflow-y-auto no-scrollbar transition-all ${viewMode === 'day' ? 'pill-grid' : 'flex flex-col gap-2'}`}>
                          {rooms
                          .filter(room => {
                            const avNode = availability?.find(a => a.room_id === room.id && a.day === dayLabel && a.hour === hour);
                            return avNode ? avNode.is_available : true;
                          })
                          .sort((a, b) => {
                            const aBooked = !!getBooking(dateStr, hour, a.id);
                            const bBooked = !!getBooking(dateStr, hour, b.id);
                            if (aBooked !== bBooked) return aBooked ? 1 : -1;
                            const score = (r) => (r.has_ac ? 10 : 0) + (r.has_projector ? 5 : 0) + (r.capacity / 10);
                            return score(b) - score(a);
                          })
                          .slice(0, pillDensity).map(room => { 
                            const booking = getBooking(dateStr, hour, room.id);
                            return (
                              <div 
                                key={room.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!booking) {
                                    const dateObj = currentWeekDay?.fullDate;
                                    onSlotClick({ day: dayLabel, hour, date: dateObj, room_id: room.id });
                                  }
                                }}
                                className={`px-3 py-2 rounded-xl border shadow-sm ${!booking ? 'hover:translate-y-[-1px] active:scale-95' : ''} transform transition-all text-sm leading-tight truncate flex items-center justify-between font-black border-border w-full ${booking ? 'bg-bg-primary opacity-60 grayscale-[0.3] cursor-not-allowed' : 'bg-bg-secondary text-text-primary cursor-pointer'}`}
                                title={`${room.name}${booking ? ` - Booked by ${booking.user_name}` : ''}`}
                              >
                                <div className="flex flex-col overflow-hidden">
                                  <span className={`font-black truncate ${booking ? 'text-text-secondary text-sm' : ''}`}>{room.name}</span>
                                  {booking && (
                                    <span className="text-[10px] text-text-secondary/70 truncate leading-none">
                                      {booking.user_name}
                                    </span>
                                  )}
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
                  );})}
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

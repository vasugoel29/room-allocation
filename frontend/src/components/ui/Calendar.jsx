import React, { useState, useEffect, useContext } from 'react';
import { Filter, Wind, Monitor } from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import { isRoomReallyFree } from '../../utils/timetableLogic';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8am to 6pm

import PageSearch from './PageSearch';

function Calendar({ onSlotClick }) {
  const { user, bookings, rooms, availability, viewMode, setViewMode, selectedDay, setSelectedDay, filters, setFilters } = useContext(AppContext);
  const onDayChange = setSelectedDay;
  const [now, setNow] = useState(new Date());
  const [expandedSlots, setExpandedSlots] = useState({}); // Key: `${dateStr}-${hour}`

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
    const dates = [];
    let d = new Date(now);
    
    // If Sat or Sun, move to next Mon
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
    else if (day === 6) d.setDate(d.getDate() + 2); // Sat -> Mon

    while (dates.length < 5) {
      const currentDay = d.getDay();
      if (currentDay !== 0 && currentDay !== 6) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const dayNum = String(d.getDate()).padStart(2, '0');
        dates.push({
          day: DAYS[currentDay - 1],
          date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: new Date(d),
          dateStr: `${year}-${month}-${dayNum}`
        });
      }
      d.setDate(d.getDate() + 1);
    }
    return dates;
  };

  const weekDates = getCurrentWeekDates();
  const displayDays = viewMode === 'day' ? [selectedDay] : weekDates.map(d => d.dateStr);

  const filteredHours = HOURS.filter(hour => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const currentHour = today.getHours();

    // Only filter globally if in 'day' view and it's today
    if (viewMode === 'day' && selectedDay === todayStr) {
        return hour >= currentHour;
    }
    
    // In Week view, we show all hours to prevent the grid from appearing empty
    return true;
  });

  const getBooking = (dateStr, hour, roomId) => {
    return bookings?.find(b => {
      const bStatus = (b.status || 'ACTIVE').toUpperCase();
      if (bStatus !== 'ACTIVE' && bStatus !== 'PENDING' && bStatus !== 'CONFIRMED') return false;
      const bStart = new Date(b.start_time);
      const bYear = bStart.getFullYear();
      const bMonth = String(bStart.getMonth() + 1).padStart(2, '0');
      const bDate = String(bStart.getDate()).padStart(2, '0');
      const bLocalStr = `${bYear}-${bMonth}-${bDate}`;
      const bHour = bStart.getHours();
      return bLocalStr === dateStr && bHour === hour && String(b.room_id) === String(roomId);
    });
  };

  const getFloorFromRoomName = (name) => {
    if (!name) return '0';
    const clean = name.trim().toUpperCase();
    if (clean.startsWith('CR')) {
       // "CR 403" -> "4"
       const parts = clean.split(/\s+/);
       return parts[1] ? parts[1].charAt(0) : '0';
    }
    // "5222" -> "2" (Wait, 5222 is CC-NW-1? No, 5222 is usually CC-1. 
    // In many academic buildings, the SECOND digit is the floor, or the FIRST.
    // Let's assume the FIRST digit is the floor for simple numbers like 5222 -> Floor 5? 
    // No, common pattern is 5xxx is 5th floor.
    return clean.charAt(0);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden w-full relative pb-0 bg-transparent">
      {/* Page Header (Consistent with History/Timetable) */}
      <div className="p-4 sm:p-6 bg-tonal-secondary/10 backdrop-blur-md shrink-0">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight uppercase leading-none font-display">
              Room Schedule
            </h1>
            <p className="text-[10px] sm:text-xs text-text-secondary font-bold uppercase tracking-widest mt-1 opacity-60">
              Structural precision in time and space
            </p>
          </div>
          <PageSearch 
            value={filters.searchTerm} 
            onChange={(val) => setFilters(prev => ({ ...prev, searchTerm: val }))} 
            placeholder="Search rooms..." 
            className="w-full sm:w-64"
          />
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-auto flex-1 w-full no-scrollbar">
        <div className={`flex flex-col min-h-full w-full relative layout-transition ${viewMode === 'day' ? 'min-w-[320px]' : 'min-w-[800px]'}`}>
          <div className={`grid bg-surface-low/90 backdrop-blur-md sticky top-0 z-30 layout-transition ${viewMode === 'day' ? 'grid-cols-[50px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-[50px_repeat(5,1fr)] sm:grid-cols-[120px_repeat(5,1fr)]'}`}>
            <div className="p-2 sm:p-4 text-[10px] sm:text-xs font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center justify-center bg-tonal-secondary/20 font-display">Time</div>
            {weekDates.filter(d => displayDays.includes(d.dateStr)).map(({ dateStr, day, date }) => (
              <div 
                key={dateStr} 
                className={`p-2 sm:p-4 text-center flex flex-col gap-0.5 sm:gap-1 layout-transition ${viewMode === 'week' ? 'cursor-pointer hover:bg-primary-accent/5 active:bg-primary-accent/10 transition-colors' : ''}`}
                onClick={() => {
                  if (viewMode === 'week') {
                    onDayChange(dateStr);
                    setViewMode('day');
                  }
                }}
              >
                <span className="text-lg sm:text-2xl font-extrabold text-text-primary uppercase tracking-tight leading-none font-display">{day}</span>
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
                    <span className="bg-tertiary text-white text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-0.5 rounded shadow-tertiary whitespace-nowrap">
                      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex-1 h-[1px] sm:h-[1.5px] bg-tertiary relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-tertiary rounded-full shadow-tertiary"></div>
                  </div>
                </div>
              </div>
            )}

            {rooms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-tonal-secondary/5 flex-1 p-8 rounded-[2rem] m-4">
                <div className="p-6 bg-tonal-secondary/10 rounded-full mb-6">
                  <Filter className="text-secondary/60" size={48} strokeWidth={1.5} />
                </div>
                <p className="text-text-secondary text-base sm:text-lg font-extrabold uppercase tracking-widest opacity-40 font-display text-center">No structural matches found</p>
              </div>
            ) : (
              filteredHours.map(hour => (
                <div key={hour} className={`flex-1 grid group layout-transition min-h-[90px] sm:min-h-[100px] ${viewMode === 'day' ? 'grid-cols-[50px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-[50px_repeat(5,1fr)] sm:grid-cols-[120px_repeat(5,1fr)]'}`}>
                  <div className="p-2 sm:p-4 text-[10px] sm:text-lg font-extrabold text-text-secondary uppercase flex flex-col items-center justify-center bg-tonal-secondary/5 transition-all font-display">
                    <span className="tracking-tight">{hour.toString().padStart(2, '0')}:00</span>
                    <span className="text-[8px] sm:text-[10px] opacity-20">{(hour+1).toString().padStart(2, '0')}:00</span>
                  </div>
                  {displayDays.map(dateStr => {
                    const currentWeekDay = weekDates.find(d => d.dateStr === dateStr);
                    const dayLabel = currentWeekDay ? currentWeekDay.day : 'Unknown';
                    
                    return (
                    <div 
                      key={dateStr} 
                      className="p-3 bg-transparent hover:bg-tonal-secondary/10 transition-colors cursor-pointer relative h-full"
                      onClick={() => {
                        const dateObj = currentWeekDay?.fullDate;
                        onSlotClick({ day: dayLabel, hour, date: dateObj });
                      }}
                    >
                      <div className={`p-1.5 h-full overflow-y-auto no-scrollbar transition-all ${viewMode === 'day' ? 'pill-grid' : 'flex flex-col gap-4'}`}>
                          {(() => {
                            const slotRooms = rooms
                              .filter(room => {
                                // Standard availability check
                                if (!isRoomReallyFree(room, dateStr, dayLabel, hour, bookings, availability)) return false;
                                
                                // Basic filters
                                const matchesSearch = !filters.searchTerm || room.name.toLowerCase().includes(filters.searchTerm.toLowerCase());
                                const roomFloor = getFloorFromRoomName(room.name);
                                const matchesFloor = filters.floor === 'all' || String(roomFloor) === String(filters.floor);
                                const matchesSmart = !filters.smartRoom || (room.has_ac && room.has_projector);
                                
                                return matchesSearch && matchesFloor && matchesSmart;
                              })
                              .sort((a, b) => {
                                const aBooked = !!getBooking(dateStr, hour, a.id);
                                const bBooked = !!getBooking(dateStr, hour, b.id);
                                if (aBooked !== bBooked) return aBooked ? 1 : -1;
                                const score = (r) => (r.has_ac ? 10 : 0) + (r.has_projector ? 5 : 0) + (r.capacity / 10);
                                return score(b) - score(a);
                              });

                            const maxRooms = isMobile ? 4 : slotRooms.length;
                            const isExpanded = expandedSlots[`${dateStr}-${hour}`];
                            const hasMore = isMobile && slotRooms.length > maxRooms;
                            const displayedRooms = (isMobile && !isExpanded && hasMore) ? slotRooms.slice(0, 3) : slotRooms;

                            return (
                              <>
                                {displayedRooms.map(room => {
                                  const booking = getBooking(dateStr, hour, room.id);
                                  const isRestricted = booking && (booking.user_role === 'admin' || booking.user_role === 'FACULTY') && user?.role !== 'admin';
                                  
                                  const windColor = room.has_ac ? (booking ? 'text-text-secondary/50' : 'text-accent') : 'text-red-500/20';
                                  const monitorColor = room.has_projector ? (booking ? 'text-text-secondary/50' : 'text-accent') : 'text-red-500/20';

                                  return (
                                    <div 
                                      key={room.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (isRestricted) return;
                                        const dateObj = currentWeekDay?.fullDate;
                                        onSlotClick({ day: dayLabel, hour, date: dateObj, room_id: room.id });
                                      }}
                                      className={`px-4 py-3 rounded-lg shadow-ambient ${!isRestricted ? 'hover:translate-y-[-2px] active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-60 grayscale-[0.3]'} transform transition-all text-sm leading-tight truncate flex items-center justify-between font-bold w-full ${booking ? (isRestricted ? 'bg-surface-lowest' : 'bg-surface-mid/80 opacity-80') : 'bg-surface-low text-text-primary'}`}
                                      title={`${room.name}${booking ? ` - Booked by ${booking.user_name} ${isRestricted ? '(Restricted)' : '(Click to Request Transfer)'}` : ''}`}
                                    >
                                      <div className="flex flex-col overflow-hidden">
                                        <span className={`font-black truncate ${booking ? 'text-text-secondary text-sm' : ''}`}>{room.name}</span>
                                        {booking && (
                                          <span className="text-[10px] text-text-secondary/70 truncate leading-none">
                                            {booking.class_name}
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex flex-col items-center gap-1.5 ml-3 flex-shrink-0 opacity-80">
                                        <Wind size={14} className={room.has_ac ? 'text-primary-accent' : 'text-text-secondary/20'} />
                                        <Monitor size={14} className={room.has_projector ? 'text-primary-accent' : 'text-text-secondary/20'} />
                                      </div>
                                    </div>
                                  );
                                })}
                                {hasMore && !isExpanded && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSlots(prev => ({ ...prev, [`${dateStr}-${hour}`]: true }));
                                    }}
                                    className="px-3 py-2 rounded-lg bg-primary-accent/5 text-primary-accent text-[10px] font-bold uppercase hover:bg-primary-accent/10 transition-all flex items-center justify-center gap-2 font-display"
                                  >
                                    Show All ({slotRooms.length})
                                  </button>
                                )}
                                {hasMore && isExpanded && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedSlots(prev => ({ ...prev, [`${dateStr}-${hour}`]: false }));
                                    }}
                                    className="px-3 py-2 rounded-xl border border-dashed border-text-secondary/40 bg-bg-secondary text-text-secondary text-[10px] font-black uppercase hover:bg-bg-primary transition-all flex items-center justify-center gap-2 mt-1"
                                  >
                                    Show Less
                                  </button>
                                )}
                              </>
                            );
                          })()}
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

import React, { useState, useEffect, useContext } from 'react';
import { Filter, Wind, Monitor, Clock } from 'lucide-react';
import { AppContext } from '../../context/AppContext';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8am to 6pm

import PageSearch from './PageSearch';

function Calendar({ onSlotClick }) {
  const { user, bookings, rooms, availability, viewMode, setViewMode, selectedDay, setSelectedDay, filters, setFilters, timetableData } = useContext(AppContext);
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

  const getCurrentWeekDates = () => {
    const dates = [];
    let d = new Date(now);
    
    const day = d.getDay();
    if (day === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
    else if (day === 6) d.setDate(d.getDate() + 2); // Sat -> Mon

    const currentD = new Date(d);
    while (dates.length < 5) {
      const currentDay = currentD.getDay();
      if (currentDay !== 0 && currentDay !== 6) {
        const year = currentD.getFullYear();
        const month = String(currentD.getMonth() + 1).padStart(2, '0');
        const dayNum = String(currentD.getDate()).padStart(2, '0');
        dates.push({
          day: DAYS[currentDay - 1],
          date: currentD.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          fullDate: new Date(currentD),
          dateStr: `${year}-${month}-${dayNum}`,
          isToday: currentD.toDateString() === new Date().toDateString()
        });
      }
      currentD.setDate(currentD.getDate() + 1);
    }
    return dates;
  };

  const weekDates = getCurrentWeekDates();
  const displayDays = viewMode === 'day' ? [selectedDay] : weekDates.map(d => d.dateStr);

  const filteredHours = HOURS.filter(hour => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const currentHour = today.getHours();

    if (viewMode === 'day' && selectedDay === todayStr) {
        return hour >= currentHour;
    }
    return true;
  });

  const getCurrentTimePosition = () => {
    const hour = now.getHours();
    const minutes = now.getMinutes();
    
    // Find index of current hour in filteredHours
    const hourIndex = filteredHours.indexOf(hour);
    if (hourIndex === -1) return null;

    // Each row is 100% / total rows
    const rowPercentage = 100 / filteredHours.length;
    const percentage = (hourIndex + minutes / 60) * rowPercentage;
    
    return { percentage };
  };

  const timePos = getCurrentTimePosition();

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

  return (
    <div className="flex flex-col flex-1 overflow-hidden w-full relative pb-0 bg-transparent">
      {/* Page Header */}
      <div className="p-4 sm:p-6 bg-tonal-secondary/10 backdrop-blur-md shrink-0 border-b border-text-secondary/10">
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

      <div className="overflow-x-auto overflow-y-auto flex-1 w-full no-scrollbar p-2 sm:p-4">
        <div className={`flex flex-col min-h-full w-full relative layout-transition bg-surface-low border border-text-secondary/10 rounded-2xl overflow-hidden ${viewMode === 'day' ? 'min-w-[320px]' : 'min-w-[800px]'}`}>
          
          {/* Days Header */}
          <div className="grid-header-sticky border-b border-text-secondary/10">
            <div className={`grid gap-0 ${viewMode === 'day' ? 'grid-cols-[50px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-[50px_repeat(5,1fr)] sm:grid-cols-[120px_repeat(5,1fr)]'}`}>
              <div className="py-4 flex items-center justify-center bg-tonal-secondary/5">
                <Clock size={16} className="text-text-secondary opacity-50" />
              </div>
              {weekDates.filter(d => displayDays.includes(d.dateStr)).map(day => (
                <div 
                  key={day.dateStr} 
                  className={`py-4 px-2 text-center transition-all border-l border-text-secondary/10 flex items-center justify-center ${viewMode === 'week' ? 'cursor-pointer hover:bg-primary-accent/5' : ''}`}
                  onClick={() => {
                    if (viewMode === 'week') {
                      onDayChange(day.dateStr);
                      setViewMode('day');
                    }
                  }}
                >
                  <h3 className="text-[10px] sm:text-xs font-black tracking-tighter sm:tracking-widest transition-colors text-text-secondary">
                    {day.day} <span className="hidden sm:inline opacity-40 ml-1">{day.date}</span>
                  </h3>
                </div>
              ))}
            </div>
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
              filteredHours.map((hour) => {
                return (
                  <div 
                    key={hour} 
                    className={`flex-1 grid gap-0 group layout-transition min-h-[90px] sm:min-h-[100px] transition-colors border-b border-text-secondary/10 last:border-b-0 ${viewMode === 'day' ? 'grid-cols-[50px_1fr] sm:grid-cols-[120px_1fr]' : 'grid-cols-[50px_repeat(5,1fr)] sm:grid-cols-[120px_repeat(5,1fr)]'}`}
                  >
                    {/* Time Label Column */}
                    <div className="flex flex-col items-center justify-center transition-colors bg-text-secondary/5">
                      <span className="text-[10px] sm:text-xs font-black text-text-primary">{String(hour).padStart(2, '0')}:00</span>
                      <span className="text-[8px] sm:text-[9px] text-text-secondary font-bold opacity-40">{String(hour + 1).padStart(2, '0')}:00</span>
                    </div>

                    {displayDays.map(dateStr => {
                      const currentWeekDay = weekDates.find(d => d.dateStr === dateStr);
                      const dayLabel = currentWeekDay ? currentWeekDay.day : 'Unknown';
                      
                      return (
                        <div 
                          key={dateStr} 
                          className="relative p-2 h-full transition-all border-l border-text-secondary/10 hover:bg-tonal-secondary/5"
                          onClick={() => {
                            const dateObj = currentWeekDay?.fullDate;
                            onSlotClick({ day: dayLabel, hour, date: dateObj });
                          }}
                        >
                          <div className="absolute inset-0 z-0 transition-opacity duration-500 opacity-0" />
                          
                          <div className={`relative z-10 h-full overflow-y-auto no-scrollbar pt-1 ${viewMode === 'day' ? 'pill-grid' : 'flex flex-col gap-2'}`}>
                            {(() => {
                              const slotRooms = rooms
                                .filter(room => {
                                  const matchesSearch = !filters.searchTerm || room.name.toLowerCase().includes(filters.searchTerm.toLowerCase());
                                  const dbFloor = filters.floor === 'G' ? 0 : (filters.floor === 'all' ? 'all' : parseInt(filters.floor));
                                  const matchesFloor = dbFloor === 'all' || Number(room.floor) === Number(dbFloor);
                                  const matchesSmart = !filters.smartRoom || (room.has_ac && room.has_projector);
                                  
                                  if (!matchesSearch || !matchesFloor || !matchesSmart) return false;

                                  // Strict Filtering Rule: Hide static occupied rooms entirely. Keep if manually booked.
                                  const hasActiveBooking = !!getBooking(dateStr, hour, room.id);
                                  const availRec = availability?.find(a => Number(a.room_id) === Number(room.id) && a.day === dayLabel && Number(a.hour) === Number(hour));
                                  const isDBUnavailable = availRec && !availRec.is_available;
                                  
                                  if (isDBUnavailable && !hasActiveBooking) return false; // PULL FROM ARRAY!
                                  
                                  return true;
                                })
                                .sort((a, b) => {
                                  const aBooked = !!getBooking(dateStr, hour, a.id);
                                  const bBooked = !!getBooking(dateStr, hour, b.id);
                                  
                                  // Check database availability
                                  const aAvail = availability?.find(a => Number(a.room_id) === Number(a.id) && a.day === dayLabel && Number(a.hour) === Number(hour));
                                  const bAvail = availability?.find(a => Number(a.room_id) === Number(b.id) && a.day === dayLabel && Number(a.hour) === Number(hour));
                                  
                                  // If explicitly marked not available in DB, consider it occupied
                                  const isAOccupied = aBooked || (aAvail && !aAvail.is_available);
                                  const isBOccupied = bBooked || (bAvail && !bAvail.is_available);
                                  
                                  if (isAOccupied !== isBOccupied) return isAOccupied ? 1 : -1;
                                  
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
                                    const availRecord = availability?.find(a => Number(a.room_id) === Number(room.id) && a.day === dayLabel && Number(a.hour) === Number(hour));
                                    const isDBUnavailable = availRecord && !availRecord.is_available;
                                    
                                    // Fallback to static class text if they both coexist, but prioritize DB status
                                    const daySchedule = timetableData?.[dayLabel] || [];
                                    const staticClass = !booking ? daySchedule.find(sc => sc.room && (sc.room.trim().toLowerCase() === room.name.trim().toLowerCase() || sc.room.trim().toLowerCase().includes(room.name.trim().toLowerCase())) && sc.time === hour) : null;
                                    
                                    const isRestricted = booking && (booking.user_role === 'ADMIN' || booking.user_role === 'FACULTY') && user?.role !== 'ADMIN';
                                    const isOccupied = booking || isDBUnavailable || staticClass;
                                    
                                    return (
                                      <div 
                                        key={room.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isRestricted) return;
                                          const dateObj = currentWeekDay?.fullDate;
                                          onSlotClick({ day: dayLabel, hour, date: dateObj, room_id: room.id });
                                        }}
                                       className={`rounded-xl room-card ${!isRestricted ? 'hover:translate-y-[-2px] active:scale-95 cursor-pointer' : 'cursor-not-allowed opacity-60 grayscale-[0.3]'} transform transition-all text-xs sm:text-sm leading-tight truncate font-bold ${isOccupied ? (isRestricted ? 'bg-surface-lowest shadow-inner' : 'bg-surface-high/40 opacity-90') : 'text-text-primary'}`}
                                        title={`${room.name}${booking ? ` - Booked by ${booking.user_name} ${isRestricted ? '(Restricted)' : '(Click to Request Transfer)'}` : (staticClass ? ` - Academic Class: ${staticClass.subjectName}` : '')}`}
                                      >
                                        <div className="flex flex-col overflow-hidden">
                                          <span className={`font-black truncate tracking-tight ${isOccupied ? 'text-text-secondary text-[10px] sm:text-xs' : 'text-xs sm:text-sm'}`}>{room.name}</span>
                                          {booking ? (
                                            <span className="text-[8px] sm:text-[9px] text-text-secondary/80 font-bold truncate leading-none mt-0.5">
                                              {booking.user_name ? `${booking.user_name}` : (booking.class_name || 'Booked')}
                                            </span>
                                          ) : staticClass ? (
                                            <span className="text-[8px] sm:text-[9px] text-text-secondary/70 truncate leading-none mt-0.5">
                                              {staticClass.subjectName || 'Academic Class'}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="flex items-center gap-1 sm:gap-1.5 ml-1.5 sm:ml-2 flex-shrink-0">
                                          <Wind size={isMobile ? 10 : 12} className={room.has_ac ? 'text-primary' : 'text-text-secondary/10'} />
                                          <Monitor size={isMobile ? 10 : 12} className={room.has_projector ? 'text-primary' : 'text-text-secondary/10'} />
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
                                      className="w-full dashed-block group"
                                    >
                                      <div className="flex flex-col items-center gap-1">
                                        <Filter size={14} className="text-text-secondary/50 group-hover:text-primary transition-colors" />
                                        <span className="text-text-secondary/60 text-[9px] font-black uppercase tracking-tighter group-hover:text-primary">+{slotRooms.length - 3} More</span>
                                      </div>
                                    </button>
                                  )}
                                  {hasMore && isExpanded && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSlots(prev => ({ ...prev, [`${dateStr}-${hour}`]: false }));
                                      }}
                                      className="px-3 py-2 rounded-xl bg-surface-lowest text-text-secondary text-[8px] sm:text-[10px] font-black uppercase hover:bg-bg-primary transition-all flex items-center justify-center gap-2 mt-1"
                                    >
                                      Show Less
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Calendar;

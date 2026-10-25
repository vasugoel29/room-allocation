import React, { useState, useEffect, useContext, useMemo } from 'react';
import { Filter, Wind, Monitor, Clock } from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import { getDayOfWeek, buildRoomIndex, isRoomFreeIn, bookingAt } from '../../utils/timetableLogic';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HOURS = BOOKING_START_HOURS; // 08:00–20:00, the hours the server accepts (shared/bookingRules.js)

import PageSearch from '../../components/ui/PageSearch';
import { booksDirect, canBook } from '../../utils/permissions';
import { BOOKING_START_HOURS } from '../../../../shared/bookingRules.js';

function Calendar({ onSlotClick }) {
  const { bookings, rooms, roomsError, fetchRooms, availability, viewMode, setViewMode, selectedDay, setSelectedDay, filters, user } = useContext(AppContext);
  const canUserBook = canBook(user);
  const onDayChange = setSelectedDay;
  const [now, setNow] = useState(new Date());
  const [expandedSlots, setExpandedSlots] = useState({}); // Key: `${dateStr}-${hour}`

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // One index of the calendar feed and bookings; the same rule MobileBooking and the server use.
  const roomIndex = useMemo(() => buildRoomIndex(bookings, availability), [bookings, availability]);
  const isRoomReallyFreeLocal = React.useCallback(
    (room, dateStr, dayName, hour) => isRoomFreeIn(roomIndex, room, dateStr, dayName, hour), [roomIndex]);

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

  const isStudent = !booksDirect(user);

  const filteredRooms = useMemo(() => {
    return rooms.filter(room => {
      if (isStudent && room.student_access === false) return false;
      const matchesSearch = !filters.searchTerm || room.name.toLowerCase().includes(filters.searchTerm.toLowerCase());
      const dbFloor = filters.floor === 'G' ? 0 : (filters.floor === 'all' ? 'all' : parseInt(filters.floor));
      const matchesFloor = dbFloor === 'all' || Number(room.floor) === Number(dbFloor);
      const matchesSmart = !filters.smartRoom || (room.has_ac && room.has_projector);
      const matchesType = !filters.roomType || filters.roomType === 'all' || room.type === filters.roomType;
      return matchesSearch && matchesFloor && matchesSmart && matchesType;
    });
  }, [rooms, filters.searchTerm, filters.floor, filters.smartRoom, filters.roomType, isStudent]);

  return (
    <div data-tour="calendar-grid" className="flex flex-col flex-1 overflow-hidden w-full relative pb-0 bg-transparent">
      <div className="overflow-auto flex-1 w-full no-scrollbar relative rounded-2xl border border-border-subtle bg-surface-low">
        <table className={`border-separate border-spacing-0 w-full ${viewMode === 'day' ? 'min-w-[320px]' : 'min-w-[760px]'}`}>
          {/* Days Header (Sticky Anchor Top) */}
          <thead>
            <tr>
              {/* Corner Intersection Cell (Sticky Anchor Top-Left) */}
              <th className="sticky top-0 left-0 z-30 w-[55px] sm:w-[110px] min-w-[55px] sm:min-w-[110px] py-3.5 bg-surface-low border-b border-r border-border-subtle text-center align-middle">
                <Clock size={16} className="text-text-secondary opacity-50 mx-auto" />
              </th>
              {weekDates.filter(d => displayDays.includes(d.dateStr)).map((day) => (
                <th 
                  key={day.dateStr} 
                  className={`sticky top-0 z-20 py-3.5 px-2 text-center transition-all border-b border-l border-border-subtle bg-surface-low min-w-[130px] sm:min-w-[160px] ${viewMode === 'week' ? 'cursor-pointer hover:bg-surface-mid/40' : ''}`}
                  onClick={() => {
                    if (viewMode === 'week') {
                      onDayChange(day.dateStr);
                      setViewMode('day');
                    }
                  }}
                >
                  <h3 className="text-xs font-semibold text-text-secondary font-display">
                    {day.day} <span className="opacity-50 font-normal ml-1">{day.date}</span>
                  </h3>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {roomsError && rooms.length === 0 ? (
              <tr>
                <td colSpan={displayDays.length + 1} className="py-20 text-center">
                  <div role="alert" className="flex flex-col items-center justify-center p-8 gap-4 max-w-md mx-auto">
                    <p className="text-text-secondary text-sm font-semibold font-display text-center">Couldn&apos;t load rooms. Check your connection and try again.</p>
                    <button type="button" onClick={() => fetchRooms()} className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold">Retry</button>
                  </div>
                </td>
              </tr>
            ) : rooms.length === 0 ? (
              <tr>
                <td colSpan={displayDays.length + 1} className="py-20 text-center">
                  <div className="flex flex-col items-center justify-center p-8 max-w-md mx-auto">
                    <div className="p-5 bg-surface-mid/50 rounded-full mb-4">
                      <Filter className="text-secondary/60" size={40} strokeWidth={1.5} />
                    </div>
                    <p className="text-text-secondary text-sm font-semibold opacity-60 font-display text-center">No structural matches found</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredHours.map((hour) => {
                return (
                  <tr key={hour} className="group hover:bg-surface-lowest/20 transition-colors">
                    {/* Time Label Column (Sticky Anchor Left) */}
                    <td className="sticky left-0 z-10 w-[55px] sm:w-[110px] min-w-[55px] sm:min-w-[110px] py-3.5 bg-surface-low border-r border-b border-border-subtle text-center align-middle">
                      <div className="flex flex-col items-center justify-center">
                        <span className="text-xs font-semibold text-text-primary font-display">{String(hour).padStart(2, '0')}:00</span>
                        <span className="text-[11px] font-normal text-text-secondary opacity-60 font-display">{String(hour + 1).padStart(2, '0')}:00</span>
                      </div>
                    </td>

                    {displayDays.map((dateStr) => {
                      const currentWeekDay = weekDates.find(d => d.dateStr === dateStr);
                      const dayLabel = currentWeekDay?.day || getDayOfWeek(dateStr);
                      const dateObj = currentWeekDay?.fullDate || new Date(`${dateStr}T00:00:00`);
                      
                      return (
                        <td 
                          key={dateStr} 
                          className="p-2 border-b border-l border-border-subtle align-top min-w-[130px] sm:min-w-[160px]"
                        >
                          <div className={`h-full overflow-y-auto no-scrollbar pt-0.5 ${viewMode === 'day' ? 'pill-grid' : 'flex flex-col gap-1.5'}`}>
                            {(() => {
                              const slotRooms = [...filteredRooms]
                                .filter(room => {
                                  const isFree = isRoomReallyFreeLocal(room, dateStr, dayLabel, hour);
                                  if (isFree) return true;

                                  const booking = bookingAt(roomIndex, room.id, dateStr, hour);
                                  if (booking) return true;

                                  return false;
                                })
                                .sort((a, b) => {
                                  const aBooked = Boolean(bookingAt(roomIndex, a.id, dateStr, hour));
                                  const bBooked = Boolean(bookingAt(roomIndex, b.id, dateStr, hour));
                                  if (aBooked && !bBooked) return 1;
                                  if (!aBooked && bBooked) return -1;

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
                                    const booking = bookingAt(roomIndex, room.id, dateStr, hour);
                                    if (booking) {
                                      const facultySuffix = booking.faculty_name ? ` (Faculty: ${booking.faculty_name})` : '';
                                      const title = `${room.name} - Booked for ${booking.class_name || booking.purpose}${facultySuffix}`;
                                      const isClickable = canUserBook && typeof onSlotClick === 'function';

                                      return (
                                        <button
                                          type="button"
                                          key={room.id}
                                          onClick={isClickable ? (e) => {
                                            e.stopPropagation();
                                            onSlotClick({ day: dayLabel, hour, date: dateObj, room_id: room.id, booking });
                                          } : undefined}
                                          tabIndex={isClickable ? 0 : -1}
                                          aria-disabled={!isClickable}
                                          className={`rounded-xl room-card transform transition-all opacity-45 hover:opacity-100 focus-visible:opacity-100 text-left ${
                                            isClickable ? 'hover:translate-y-[-1px] active:scale-[0.98] cursor-pointer' : 'cursor-default'
                                          }`}
                                          title={title}
                                        >
                                          <span className="flex flex-col text-left overflow-hidden py-1">
                                            <span className="font-semibold truncate tracking-tight text-xs font-display">{room.name}</span>
                                            <span className="text-[11px] font-normal text-text-secondary opacity-70 truncate block max-w-[85px] sm:max-w-[120px] leading-tight mt-0.5">
                                              {booking.class_name || booking.purpose}
                                            </span>
                                          </span>
                                          <span className="flex items-center gap-1 sm:gap-1.5 ml-1.5 sm:ml-2 flex-shrink-0" aria-hidden="true">
                                            <Wind size={isMobile ? 11 : 13} className={room.has_ac ? 'text-primary' : 'text-text-secondary/10'} />
                                            <Monitor size={isMobile ? 11 : 13} className={room.has_projector ? 'text-primary' : 'text-text-secondary/10'} />
                                          </span>
                                        </button>
                                      );
                                    }

                                    const isClickable = canUserBook && typeof onSlotClick === 'function';
                                    return (
                                      <button
                                        type="button"
                                        key={room.id}
                                        onClick={isClickable ? (e) => {
                                          e.stopPropagation();
                                          onSlotClick({ day: dayLabel, hour, date: dateObj, room_id: room.id });
                                        } : undefined}
                                        tabIndex={isClickable ? 0 : -1}
                                        aria-disabled={!isClickable}
                                        className={`rounded-xl room-card transform transition-all text-xs leading-tight truncate font-semibold text-text-primary text-left ${
                                          isClickable ? 'hover:translate-y-[-1px] active:scale-[0.98] cursor-pointer' : 'cursor-default'
                                        }`}
                                        title={`${room.name} - Available`}
                                      >
                                        <span className="flex flex-col overflow-hidden">
                                          <span className="font-semibold truncate tracking-tight text-xs font-display">{room.name}</span>
                                        </span>
                                        <span className="flex items-center gap-1 sm:gap-1.5 ml-1.5 sm:ml-2 flex-shrink-0" aria-hidden="true">
                                          <Wind size={isMobile ? 11 : 13} className={room.has_ac ? 'text-primary' : 'text-text-secondary/10'} />
                                          <Monitor size={isMobile ? 11 : 13} className={room.has_projector ? 'text-primary' : 'text-text-secondary/10'} />
                                        </span>
                                      </button>
                                    );
                                  })}
                                  {hasMore && !isExpanded && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSlots(prev => ({ ...prev, [`${dateStr}-${hour}`]: true }));
                                      }}
                                      className="w-full dashed-block group py-2"
                                    >
                                      <div className="flex flex-col items-center gap-0.5">
                                        <Filter size={13} className="text-text-secondary/50 group-hover:text-primary transition-colors" />
                                        <span className="text-text-secondary text-xs font-medium group-hover:text-primary">+{slotRooms.length - 3} More</span>
                                      </div>
                                    </button>
                                  )}
                                  {hasMore && isExpanded && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedSlots(prev => ({ ...prev, [`${dateStr}-${hour}`]: false }));
                                      }}
                                      className="px-3 py-1.5 rounded-xl bg-surface-lowest text-text-secondary text-xs font-medium hover:bg-surface-mid transition-all flex items-center justify-center gap-1.5 mt-1"
                                    >
                                      Show Less
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Calendar;

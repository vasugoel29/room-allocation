import React, { useState, useEffect, useCallback } from 'react';
import { roomService } from '../services/roomService';
import { bookingService } from '../services/bookingService';
import { adminService } from '../services/adminService';
import { toast } from 'react-hot-toast';
import { 
  LayoutGrid, Calendar, ChevronLeft, ChevronRight, Search, 
  AlertTriangle, Check, Loader, User, Clock, Trash2, X, Plus
} from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const HOURS = Array.from({ length: 10 }, (_, i) => i + 8); // 8 AM to 5 PM start hours (last slot 17:00-18:00)

const getDatesOfWeek = (startDateStr) => {
  const dates = [];
  const start = new Date(startDateStr);
  for (let i = 0; i < 5; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
};

const getMonday = (d) => {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const mon = new Date(d.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
};

const formatDateISO = (d) => {
  return d.toISOString().split('T')[0];
};

const RoomScheduleGrid = () => {
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [currentWeekMon, setCurrentWeekMon] = useState(getMonday(new Date()));
  const [loading, setLoading] = useState(false);
  const [scheduleData, setScheduleData] = useState(null);
  
  // Search state for room selector dropdown
  const [roomSearch, setRoomSearch] = useState('');
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);

  // Drawer state
  const [drawer, setDrawer] = useState(null); // null | { date, startHour, endHour }
  const [bookingPurpose, setBookingPurpose] = useState('');
  const [conflictChecking, setConflictChecking] = useState(false);
  const [conflictData, setConflictData] = useState({ hasConflict: false, conflicts: [] });
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Load all rooms initially
  useEffect(() => {
    roomService.getRooms()
      .then(data => {
        setRooms(data);
        if (data.length > 0) {
          setSelectedRoomId(data[0].id);
        }
      })
      .catch(err => toast.error('Failed to load rooms list'));
  }, []);

  // Fetch week schedule when selected room or week change
  const fetchSchedule = useCallback(async () => {
    if (!selectedRoomId) return;
    setLoading(true);
    try {
      const monStr = formatDateISO(currentWeekMon);
      const data = await roomService.getRoomWeekSchedule(selectedRoomId, monStr);
      setScheduleData(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedRoomId, currentWeekMon]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const handlePrevWeek = () => {
    const nextMon = new Date(currentWeekMon);
    nextMon.setDate(currentWeekMon.getDate() - 7);
    setCurrentWeekMon(nextMon);
  };

  const handleNextWeek = () => {
    const nextMon = new Date(currentWeekMon);
    nextMon.setDate(currentWeekMon.getDate() + 7);
    setCurrentWeekMon(nextMon);
  };

  const handleToday = () => {
    setCurrentWeekMon(getMonday(new Date()));
  };

  // Find cell status: returns { type: 'free'|'timetable'|'booking'|'conflict', details }
  const getCellStatus = (dayName, hour, dateStr) => {
    if (!scheduleData) return { type: 'free' };

    // 1. Check timetable slot (recurring)
    const shortDay = dayName.substring(0, 3).toLowerCase();
    const isTimetable = scheduleData.timetableBlocks?.find(
      b => (b.day || '').toLowerCase() === shortDay && b.hour === hour
    );

    // 2. Check bookings (date specific)
    const activeBooking = scheduleData.bookings?.find(b => {
      if (b.start_time && b.end_time) {
        const st = new Date(b.start_time);
        const et = new Date(b.end_time);
        const year = st.getFullYear();
        const month = String(st.getMonth() + 1).padStart(2, '0');
        const day = String(st.getDate()).padStart(2, '0');
        const localDateStr = `${year}-${month}-${day}`;
        const startHour = st.getHours();
        const endHour = et.getHours();
        return localDateStr === dateStr && hour >= startHour && hour < endHour;
      }
      return b.date === dateStr && hour >= b.startHour && hour < b.endHour;
    });

    if (isTimetable && activeBooking) {
      return { type: 'conflict', isTimetable, activeBooking };
    }
    if (isTimetable) {
      return { type: 'timetable', isTimetable };
    }
    if (activeBooking) {
      return { type: 'booking', activeBooking };
    }

    return { type: 'free' };
  };

  // Check conflicts before booking
  const checkConflicts = async (date, startHour, endHour) => {
    if (!selectedRoomId) return;
    setConflictChecking(true);
    try {
      const result = await roomService.checkRoomConflict(selectedRoomId, date, startHour, endHour);
      setConflictData(result);
    } catch (err) {
      toast.error('Conflict check failed');
    } finally {
      setConflictChecking(false);
    }
  };

  const handleCellClick = (dateStr, hour) => {
    setBookingPurpose('');
    setConflictData({ hasConflict: false, conflicts: [] });
    setDrawer({ date: dateStr, startHour: hour, endHour: hour + 1 });
    checkConflicts(dateStr, hour, hour + 1);
  };

  // Resolve timetable conflict
  const resolveTimetableConflict = async (slotId) => {
    if (!slotId) return;
    if (!window.confirm('Are you sure you want to delete this timetable slot to resolve the conflict?')) return;
    try {
      await adminService.deleteTimetableSlot(slotId);
      toast.success('Timetable slot removed successfully');
      // Re-run conflict checking and refresh schedule
      if (drawer) {
        checkConflicts(drawer.date, drawer.startHour, drawer.endHour);
      }
      fetchSchedule();
    } catch (err) {
      toast.error(err.message || 'Failed to remove timetable slot');
    }
  };

  // Resolve booking conflict
  const resolveBookingConflict = async (bookingId) => {
    if (!bookingId) return;
    if (!window.confirm('Are you sure you want to cancel this booking to resolve the conflict?')) return;
    try {
      await bookingService.cancelBooking(bookingId);
      toast.success('Booking cancelled successfully');
      // Re-run conflict checking and refresh schedule
      if (drawer) {
        checkConflicts(drawer.date, drawer.startHour, drawer.endHour);
      }
      fetchSchedule();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel booking');
    }
  };

  // Submit quick booking
  const handleCreateBooking = async (e) => {
    e.preventDefault();
    if (!bookingPurpose.trim()) {
      toast.error('Booking purpose is required');
      return;
    }
    setSubmittingBooking(true);
    try {
      const [year, month, day] = drawer.date.split('-').map(Number);
      const startTime = new Date(year, month - 1, day, drawer.startHour, 0, 0, 0);
      const endTime = new Date(year, month - 1, day, drawer.endHour, 0, 0, 0);

      await adminService.quickBook({
        room_id: parseInt(selectedRoomId),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        purpose: bookingPurpose
      });

      toast.success('Booking created successfully!');
      setDrawer(null);
      fetchSchedule();
    } catch (err) {
      toast.error(err.message || 'Booking creation failed');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const weekDates = getDatesOfWeek(currentWeekMon);
  const selectedRoom = rooms.find(r => String(r.id) === String(selectedRoomId));

  const filteredRooms = rooms.filter(r => 
    r.name.toLowerCase().includes(roomSearch.toLowerCase()) ||
    (r.building && r.building.toLowerCase().includes(roomSearch.toLowerCase()))
  );

  return (
    <div className="p-6 space-y-6 animate-in fade-in duration-300">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight font-display capitalize italic flex items-center gap-3">
            <LayoutGrid className="text-secondary" size={28} />
            Room Schedule Grid
          </h2>
          <p className="text-text-secondary text-xs capitalize tracking-widest font-bold opacity-50 mt-1">
            Visualise slots, resolve conflicts, and reserve space in real-time
          </p>
        </div>

        {/* Week Navigator */}
        <div className="flex items-center gap-2 bg-surface-mid/30 border border-border/10 p-1.5 rounded-2xl">
          <button 
            onClick={handlePrevWeek}
            className="p-2 hover:bg-surface-mid rounded-xl text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[10px] capitalize font-extrabold tracking-widest text-text-primary px-3 flex items-center gap-2">
            <Calendar size={14} className="text-secondary" />
            {weekDates[0] && weekDates[0].toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} 
            {' – '} 
            {weekDates[5] && weekDates[5].toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button 
            onClick={handleNextWeek}
            className="p-2 hover:bg-surface-mid rounded-xl text-text-secondary hover:text-text-primary transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button 
            onClick={handleToday}
            className="bg-tonal-secondary/15 hover:bg-tonal-secondary/25 px-3 py-1.5 rounded-xl text-[9px] capitalize font-bold tracking-widest text-text-primary transition-colors"
          >
            Today
          </button>
        </div>
      </div>

      {/* Room Selector Dropdown */}
      <div className="relative w-full max-w-sm z-20">
        <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Select Room</label>
        <div 
          onClick={() => setShowRoomDropdown(!showRoomDropdown)}
          className="flex items-center justify-between w-full bg-surface-mid/50 border border-border/10 rounded-2xl px-4 py-3.5 text-sm text-text-primary font-bold cursor-pointer hover:border-border/30 transition-colors"
        >
          <span>
            {selectedRoom ? `Room ${selectedRoom.name} (${selectedRoom.building || 'Main Block'})` : 'Select a room...'}
          </span>
          <Search size={16} className="text-text-secondary" />
        </div>

        {showRoomDropdown && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-shift-high border border-border/20 shadow-2xl rounded-2xl overflow-hidden p-3 space-y-2 animate-in slide-in-from-top-2 duration-150">
            <input
              value={roomSearch}
              onChange={e => setRoomSearch(e.target.value)}
              placeholder="Search room name or building..."
              className="w-full bg-surface-mid border border-border/10 rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-primary/50"
              onClick={e => e.stopPropagation()}
            />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filteredRooms.map(r => (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRoomId(r.id);
                    setShowRoomDropdown(false);
                    setRoomSearch('');
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-xl cursor-pointer hover:bg-surface-mid transition-colors ${String(r.id) === String(selectedRoomId) ? 'bg-primary/25 text-primary' : 'text-text-secondary'}`}
                >
                  Room {r.name} · {r.building || 'Main Block'} · Cap: {r.capacity}
                </div>
              ))}
              {filteredRooms.length === 0 && (
                <div className="text-center py-4 text-xs text-text-secondary">No rooms match search</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Grid Container */}
      <div className="rounded-[2.5rem] border border-border/10 overflow-hidden bg-tonal-secondary/5 p-6 relative">
        {loading && (
          <div className="absolute inset-0 bg-shift-low/50 backdrop-blur-[1px] flex items-center justify-center z-10">
            <Loader className="animate-spin text-primary" size={32} />
          </div>
        )}

        <div className="overflow-x-auto min-w-full">
          <div className="min-w-[1000px]">
            {/* Hour headers */}
            <div className="grid grid-cols-11 gap-2 border-b border-border/10 pb-3 mb-3 text-center">
              <div className="text-left text-[9px] capitalize tracking-widest font-extrabold text-text-secondary flex items-center pl-2">Day &amp; Date</div>
              {HOURS.map(h => (
                <div key={h} className="text-[9px] capitalize tracking-widest font-extrabold text-text-secondary font-mono">
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Days rows */}
            <div className="space-y-3">
              {DAYS.map((dayName, dayIdx) => {
                const date = weekDates[dayIdx];
                const dateStr = date ? formatDateISO(date) : '';
                return (
                  <div key={dayName} className="grid grid-cols-11 gap-2 items-stretch">
                    {/* Y-axis Day Header */}
                    <div className="bg-surface-mid/40 rounded-2xl p-3 border border-border/5 flex flex-col justify-center">
                      <span className="text-xs font-bold text-text-primary">{dayName}</span>
                      <span className="text-[9px] capitalize tracking-widest text-text-secondary font-extrabold opacity-60">
                        {date ? date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : ''}
                      </span>
                    </div>

                    {/* Hourly cells */}
                    {HOURS.map(hour => {
                      const status = getCellStatus(dayName, hour, dateStr);

                      if (status.type === 'timetable') {
                        return (
                          <div 
                            key={hour} 
                            className="bg-primary/10 border border-primary/20 rounded-2xl p-2 flex flex-col justify-between group relative overflow-hidden"
                            title={`${status.isTimetable.faculty || 'Timetable'}: ${status.isTimetable.subject || 'Scheduled Class'}`}
                          >
                            <span className="text-[9px] capitalize font-bold tracking-tight text-primary leading-tight truncate">
                              {status.isTimetable.subject || 'Scheduled Class'}
                            </span>
                            <span className="text-[8px] capitalize tracking-widest font-extrabold text-text-secondary opacity-75 truncate">
                              {status.isTimetable.faculty || 'Timetable'}
                            </span>
                          </div>
                        );
                      }

                      if (status.type === 'booking') {
                        return (
                          <div 
                            key={hour} 
                            className="bg-secondary/15 border border-secondary/25 rounded-2xl p-2 flex flex-col justify-between group relative overflow-hidden"
                            title={`Booked by ${status.activeBooking.bookerName}: ${status.activeBooking.purpose}`}
                          >
                            <span className="text-[9px] capitalize font-bold tracking-tight text-secondary leading-tight truncate">
                              {status.activeBooking.purpose}
                            </span>
                            <span className="text-[8px] capitalize tracking-widest font-extrabold text-text-secondary opacity-75 truncate">
                              {status.activeBooking.bookerName}
                            </span>
                          </div>
                        );
                      }

                      if (status.type === 'conflict') {
                        return (
                          <div 
                            key={hour} 
                            onClick={() => handleCellClick(dateStr, hour)}
                            className="bg-red-500/10 border border-red-500/30 rounded-2xl p-2 flex flex-col justify-between group relative cursor-pointer hover:bg-red-500/20 transition-colors"
                            title="Conflict detected! Click to resolve."
                          >
                            <span className="text-[9px] capitalize font-bold tracking-tight text-red-400 leading-tight">
                              CONFLT
                            </span>
                            <span className="bg-secondary text-white font-extrabold text-[8px] rounded px-1 self-start capitalize">
                              Resolve
                            </span>
                          </div>
                        );
                      }

                      // Available cell
                      return (
                        <div
                          key={hour}
                          onClick={() => handleCellClick(dateStr, hour)}
                          className="bg-surface-mid/10 hover:bg-surface-mid/30 border border-dashed border-border/10 rounded-2xl p-2.5 flex items-center justify-center cursor-pointer transition-all active:scale-95 group"
                        >
                          <Plus size={14} className="text-text-secondary/20 group-hover:text-primary transition-colors" />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Grid column styling */}
      <style>{`
        .grid-cols-11 {
          grid-template-columns: 160px repeat(10, minmax(0, 1fr));
        }
      `}</style>

      {/* Sidebar Drawer */}
      {drawer && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-shift-low border-l border-border/20 shadow-2xl flex flex-col p-6 animate-in slide-in-from-right duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-border/10">
            <div>
              <h3 className="text-lg font-extrabold text-white capitalize tracking-tight font-display">Create Booking</h3>
              <p className="text-[10px] text-text-secondary capitalize tracking-widest font-bold opacity-40 mt-0.5">
                Room {selectedRoom?.name}
              </p>
            </div>
            <button onClick={() => setDrawer(null)} className="p-2 rounded-xl hover:bg-surface-mid text-text-secondary hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleCreateBooking} className="flex-1 flex flex-col justify-between py-6 space-y-6">
            <div className="space-y-6">
              {/* Timing info */}
              <div className="bg-surface-mid/30 rounded-2xl p-4 border border-border/5 space-y-3">
                <div className="flex items-center gap-3 text-xs text-text-secondary font-medium">
                  <Calendar size={14} className="text-secondary" />
                  <span>Date: <strong className="text-white">{drawer.date}</strong></span>
                </div>
                <div className="flex items-center gap-3 text-xs text-text-secondary font-medium">
                  <Clock size={14} className="text-secondary" />
                  <span>Slot: <strong className="text-white">{String(drawer.startHour).padStart(2, '0')}:00 - {String(drawer.endHour).padStart(2, '0')}:00</strong></span>
                </div>
              </div>

              {/* Conflict Panel */}
              <div className="space-y-2">
                <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary">Availability Status</label>
                {conflictChecking ? (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Loader size={14} className="animate-spin text-primary" />
                    Checking for conflicts...
                  </div>
                ) : conflictData.hasConflict ? (
                  <div className="space-y-3">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3">
                      <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={16} />
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-red-400 block capitalize">Conflict Detected!</span>
                        <p className="text-[11px] text-text-secondary leading-normal">
                          This slot overlaps with existing schedules. Resolve below to unlock booking.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {conflictData.conflicts.map((conflict, i) => (
                        <div key={i} className="bg-surface-mid/50 border border-border/10 rounded-xl p-3 flex items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <span className="text-[9px] capitalize font-extrabold tracking-wider text-text-secondary px-1.5 py-0.5 bg-shift-high rounded block w-fit mb-1">
                              {conflict.type}
                            </span>
                            <span className="text-xs font-bold text-text-primary block">
                              {conflict.type === 'timetable' ? conflict.subject : conflict.purpose}
                            </span>
                            <span className="text-[10px] text-text-secondary block">
                              {conflict.type === 'timetable' ? conflict.faculty : `By ${conflict.booker}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => conflict.type === 'timetable' ? resolveTimetableConflict(conflict.slotId) : resolveBookingConflict(conflict.bookingId)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-2 rounded-xl transition-colors shrink-0"
                            title="Resolve conflict"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-400/10 border border-green-400/20 rounded-2xl p-4 flex items-center gap-3">
                    <Check className="text-green-400" size={16} />
                    <span className="text-xs font-bold text-green-400 capitalize">Slot is free &amp; available</span>
                  </div>
                )}
              </div>

              {/* Purpose Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary">Booking Purpose *</label>
                <input
                  value={bookingPurpose}
                  onChange={e => setBookingPurpose(e.target.value)}
                  placeholder="e.g. Guest Lecture, Lab practice..."
                  className="w-full bg-surface-mid border border-border/15 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                  required
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 pt-4 border-t border-border/10">
              <button 
                type="button" 
                onClick={() => setDrawer(null)}
                className="flex-1 bg-surface-mid text-text-secondary px-4 py-3.5 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-surface-mid/75 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={conflictData.hasConflict || conflictChecking || submittingBooking}
                className="flex-1 bg-primary disabled:opacity-30 disabled:pointer-events-none text-white px-4 py-3.5 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {submittingBooking ? (
                  <>
                    <Loader size={14} className="animate-spin" /> Submitting...
                  </>
                ) : (
                  'Confirm Booking'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};

export default RoomScheduleGrid;

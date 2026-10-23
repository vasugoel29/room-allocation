import React, { useState, useContext, useEffect } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, Clock, Hash, CheckCircle, AlertCircle, User, ChevronRight, Search, Wind, Monitor, Sparkles, MapPin, Sun, Moon } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { bookingService } from '../services/bookingService';
import { roomService } from '../services/roomService';
import { getClassConflict, isRoomReallyFree } from '../utils/timetableLogic';
import { getInitialBookingDateObject } from '../utils/dateHelpers';
import toast from 'react-hot-toast';
import DatePickerDropdown from '../components/ui/DatePickerDropdown';
import NotificationBell from '../components/ui/NotificationBell';
import { useSearchDebounce } from '../hooks/useSearchDebounce';
import { addMinutesToUtc, istDateTimeToUtc } from '../utils/timezone';
import { booksDirect, P, can } from '../utils/permissions';
import { BOOKING_START_HOURS } from '../../../shared/bookingRules.js';

function MobileBooking({ onBack }) {
  const { user, faculties, bookings, availability, fetchRooms, fetchBookings, fetchAvailability, theme, setTheme } = useContext(AppContext);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      try {
        const data = await roomService.getRooms();
        if (active && Array.isArray(data)) {
          setRooms(data);
        }
      } catch (err) {
        console.error("Failed to load rooms", err);
      }
    };
    loadRooms();
    return () => { active = false; };
  }, []);

  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(() => getInitialBookingDateObject());
  const [selectedHour, setSelectedHour] = useState(8);
  const [selectedRoom, setSelectedRoom] = useState('');
  const selectedRoomObj = rooms.find(r => r.id === selectedRoom);
  const [purpose, setPurpose] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const debouncedFacultySearch = useSearchDebounce(facultySearch, 200);
  const [isFacultyOpen, setIsFacultyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const debouncedRoomSearch = useSearchDebounce(roomSearch, 200);
  const [floorFilter, setFloorFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');
  const [smartRoomFilter, setSmartRoomFilter] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState('all');

  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictingClass, setConflictingClass] = useState(null);

  const isStudent = !booksDirect(user);

  // Extract unique blocks (buildings) from rooms and sort alphabetically, excluding test data
  const blocks = [
    'all',
    ...[...new Set(
      rooms
        .map(r => r.building)
        .filter(b => Boolean(b) && b.trim().toLowerCase() !== 'test block')
    )].sort((a, b) => a.localeCompare(b))
  ];

  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;


  const handleDateChange = (newDateStr) => {
    const [y, m, d] = newDateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const now = new Date();
    now.setHours(0,0,0,0);
    
    if (date < now) {
      toast.error("Cannot book in the past");
      return;
    }
    setSelectedDate(date);
  };

  // Step 1: Date & Time logic
  const HOURS = BOOKING_START_HOURS; // final slot is 19:00–20:00

  const getDayName = (date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

  // Filter available rooms for the selected slot

  const dayName = getDayName(selectedDate);

  const availableRooms = rooms.filter(room => {
    // Exclude dummy test blocks
    if (room.building && room.building.trim().toLowerCase() === 'test block') return false;

    // Comprehensive availability check (Overides + Static Schedule + Bookings)
    if (!isRoomReallyFree(room, dateStr, dayName, selectedHour, bookings, availability)) {
      return false;
    }

    // 3. Search filter
    if (debouncedRoomSearch && !room.name.toLowerCase().includes(debouncedRoomSearch.toLowerCase())) return false;

    // 4. Floor filter
    if (floorFilter !== 'all' && String(room.floor) !== String(floorFilter)) return false;

    // 5. Block filter
    if (blockFilter !== 'all' && room.building !== blockFilter) return false;

    // 6. Smart Room filter (has BOTH AC and Projector)
    if (smartRoomFilter && (!room.has_ac || !room.has_projector)) return false;

    // 7. Room Type filter
    if (roomTypeFilter !== 'all' && room.type !== roomTypeFilter) return false;

    // 8. Restriction for students: cannot book Committee Rooms or Auditoriums
    if (isStudent && (room.type === 'Committee Room' || room.type === 'Auditorium')) return false;

    return true;
  });

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    const start_time = istDateTimeToUtc(dateStr, selectedHour);
    const end_time = addMinutesToUtc(start_time, 60);
    const targetDate = new Date(start_time);

    const payload = {
      room_id: selectedRoom,
      start_time,
      end_time,
      faculty_id: isStudent ? selectedFaculty : null,
      purpose: purpose
    };

    try {
      // 1. Check for Class Conflicts
      const isRep = can(user, P.BOOKINGS);
      const conflict = getClassConflict(user, dateStr, selectedHour, bookings, availability || []);
      
      if (conflict) {
        if (isRep) {
          setConflictingClass(conflict);
          setIsConflictModalOpen(true);
          setLoading(false);
          return;
        } else {
          setError(`You already have a class "${conflict.subjectName || conflict.subject}" at this time. Please contact your Rep to reschedule.`);
          setLoading(false);
          return;
        }
      }

      await bookingService.createBooking(payload);
      
      const roomName = rooms.find(r => r.id === selectedRoom)?.name || selectedRoom;
      const formattedDateStr = targetDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
      const dayName = getDayName(selectedDate);

      if (isStudent && selectedFaculty) {
        const facultyName = faculties.find(f => f.id === selectedFaculty)?.name || 'Faculty';
        toast.success(
          `Request sent to Prof. ${facultyName} for Room ${roomName} from ${selectedHour}:00 to ${selectedHour + 1}:00 on ${formattedDateStr}.`
        );
      } else {
        toast.success(
          `Success! Room ${roomName} has been booked for ${dayName} at ${selectedHour}:00.`
        );
      }

      fetchRooms();
      fetchBookings();
      fetchAvailability();
      setConflictingClass(null);
      setIsConflictModalOpen(false);
      onBack();
    } catch (err) {
      setError(err.message || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-surface-lowest fixed inset-0 z-[60] overflow-y-auto no-scrollbar pb-20">
      {/* Header */}
      <div className="p-4 flex items-center justify-between bg-surface-low sticky top-0 z-10 font-display border-b border-border-subtle shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-mid/40 transition-colors" aria-label="Go back">
            <ArrowLeft size={22} />
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-extrabold text-text-primary tracking-tight leading-none capitalize">Create Booking</h1>
            <p className="text-[10px] font-extrabold text-primary capitalize tracking-widest mt-1 opacity-80">Step {step} of 3</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-xl bg-surface-lowest border border-border-subtle text-text-secondary hover:text-text-primary transition-all active:scale-95 shadow-sm"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <NotificationBell />
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 text-red-600 text-sm flex items-center gap-3 animate-in fade-in zoom-in duration-300">
            <AlertCircle size={20} />
            <p className="font-extrabold tracking-tight capitalize text-[11px] font-display">{error}</p>
          </div>
        )}

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-text-secondary capitalize flex items-center gap-2 font-display">
                <CalendarIcon size={14} className="text-primary" />
                Select Date
              </label>
              
              <DatePickerDropdown 
                selectedDate={dateStr}
                onChange={handleDateChange}
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-text-secondary capitalize flex items-center gap-2 font-display">
                <Clock size={14} className="text-primary" />
                Select Start Time
              </label>
              <div className="grid grid-cols-4 gap-2">
                {HOURS.map(hour => {
                   const now = new Date();
                   const slotEnd = new Date(selectedDate);
                   slotEnd.setHours(hour + 1, 0, 0, 0);
                   const isPast = slotEnd.getTime() <= now.getTime();
                   return (
                    <button
                      key={hour}
                      disabled={isPast}
                      onClick={() => setSelectedHour(hour)}
                      className={`py-3 rounded-xl text-xs transition-all font-display ${isPast ? 'opacity-20 grayscale cursor-not-allowed' : selectedHour === hour ? 'bg-primary text-white font-semibold shadow-ambient' : 'bg-surface-mid/60 text-text-primary font-medium hover:bg-surface-mid'}`}
                    >
                      {hour.toString().padStart(2, '0')}:00
                    </button>
                  );
                })}
              </div>
            </div>

            <button 
              onClick={() => {
                const now = new Date();
                const slotEnd = new Date(selectedDate);
                slotEnd.setHours(selectedHour + 1, 0, 0, 0);
                if (slotEnd.getTime() <= now.getTime()) {
                  toast.error("Please select a future time slot");
                  return;
                }
                const day = selectedDate.getDay();
                if ((day === 0 || day === 6) && isStudent) {
                  toast.error("Students are not allowed to book rooms on weekends");
                  return;
                }
                setStep(2);
              }}
              className="w-full bg-primary text-white font-semibold py-4 rounded-2xl shadow-ambient flex items-center justify-center gap-2 active:scale-95 transition-all text-sm mt-2 font-display capitalize"
            >
              Next: Select Room
              <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Step 2: Room Selection */}
        {step === 2 && (
          <div className="space-y-3.5 animate-in slide-in-from-right duration-300">
            <div className="bg-surface-low p-3.5 rounded-2xl flex items-center justify-between shadow-sm border border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                   <CalendarIcon size={16} />
                </div>
                <div className="font-display">
                   <p className="text-[11px] font-medium text-text-secondary">Selected Time</p>
                   <p className="text-xs font-semibold text-text-primary capitalize">{getDayName(selectedDate)}, {selectedDate.getDate()} @ {selectedHour}:00</p>
                </div>
              </div>
              <button onClick={() => setStep(1)} className="text-primary font-semibold text-xs px-2.5 py-1 rounded-lg bg-primary/5 hover:bg-primary/10 font-display transition-colors">Edit</button>
            </div>

            {/* Filters */}
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    type="text"
                    placeholder="Quick search room..."
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    className="w-full bg-surface-low border border-border-subtle rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-primary/50 transition-all pl-9 h-10 font-body font-medium text-text-primary placeholder:text-text-secondary/40"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/40" size={14} />
                </div>
                <button 
                  onClick={() => setSmartRoomFilter(!smartRoomFilter)}
                  className={`px-3.5 rounded-xl text-xs transition-all flex items-center gap-1.5 h-10 font-display border ${smartRoomFilter ? 'bg-tertiary text-white font-semibold border-tertiary shadow-sm' : 'bg-surface-low text-text-secondary font-medium border-border-subtle hover:text-text-primary'}`}
                >
                  <Monitor size={14} />
                  <span>AC & Projector</span>
                </button>
              </div>

              <div className="space-y-2">
                {/* Floor Level */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary capitalize font-display">Floor Level</label>
                  <div className="flex bg-surface-low p-1 rounded-xl border border-border-subtle gap-1">
                    {['all', '0', '1', '2', '3'].map(f => (
                      <button
                        key={f}
                        onClick={() => setFloorFilter(f)}
                        className={`flex-1 py-1 rounded-lg text-xs transition-all font-display ${floorFilter === f ? 'bg-primary text-white font-semibold shadow-sm' : 'text-text-secondary font-medium hover:text-text-primary'}`}
                      >
                        {f === 'all' ? 'All' : f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Room Type */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary capitalize font-display">Room Type</label>
                  <div className="flex overflow-x-auto no-scrollbar gap-1.5 py-0.5">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'Lecture Room', label: 'Lecture Rooms' },
                      { id: 'Lab', label: 'Labs' },
                      ...(isStudent ? [] : [
                        { id: 'Auditorium', label: 'Auditoriums' },
                        { id: 'Committee Room', label: 'Committee Rooms' }
                      ])
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setRoomTypeFilter(t.id)}
                        className={`px-3 py-1 rounded-lg text-xs transition-all whitespace-nowrap font-display border ${roomTypeFilter === t.id ? 'bg-primary text-white font-semibold border-primary shadow-sm' : 'bg-surface-low text-text-secondary font-medium border-border-subtle hover:text-text-primary hover:bg-surface-mid/40'}`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Block / Building */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary capitalize font-display">Block / Building</label>
                  <div className="flex overflow-x-auto no-scrollbar gap-1.5 py-0.5">
                    {blocks.map(b => (
                      <button
                        key={b}
                        onClick={() => setBlockFilter(b)}
                        className={`px-3 py-1 rounded-lg text-xs transition-all whitespace-nowrap font-display border ${blockFilter === b ? 'bg-primary text-white font-semibold border-primary shadow-sm' : 'bg-surface-low text-text-secondary font-medium border-border-subtle hover:text-text-primary hover:bg-surface-mid/40'}`}
                      >
                        {b === 'all' ? 'All Blocks' : (b === 'Smart Block' || b === 'Smart' ? 'S-Block' : b)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-1 pb-24">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text-secondary capitalize flex items-center gap-1.5 font-display">
                  <Hash size={13} className="text-primary" />
                  Available Spaces ({availableRooms.length})
                </label>
                {selectedRoomObj && (
                  <span className="text-[11px] font-bold text-primary font-display flex items-center gap-1 bg-primary/10 px-2.5 py-0.5 rounded-full animate-in fade-in">
                    Selected: {selectedRoomObj.name}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {availableRooms.map(room => {
                  const isSelected = selectedRoom === room.id;
                  return (
                    <button
                      key={room.id}
                      onClick={() => setSelectedRoom(room.id)}
                      className={`flex flex-col justify-between p-3 rounded-xl transition-all shadow-sm border text-left active:scale-[0.98] ${
                        isSelected 
                          ? 'bg-primary text-white border-primary shadow-md ring-2 ring-primary/30' 
                          : 'bg-surface-low text-text-primary border-border-subtle hover:bg-surface-mid/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 w-full">
                        <div className="overflow-hidden flex-1">
                          <p className="font-extrabold text-sm tracking-tight leading-tight truncate font-display capitalize">
                            {room.name}
                          </p>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded inline-block mt-1 font-display ${
                            isSelected ? 'bg-white/15 text-white' : 'bg-surface-mid text-text-secondary'
                          }`}>
                            {room.building || 'Room'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 pt-0.5">
                          {room.has_ac && (
                            <Wind size={12} className={isSelected ? 'text-white' : 'text-primary'} />
                          )}
                          {room.has_projector && (
                            <Monitor size={12} className={isSelected ? 'text-white' : 'text-primary'} />
                          )}
                        </div>
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-border-subtle/40 flex items-center justify-between text-[10px]">
                        <span className={`font-semibold ${isSelected ? 'text-white/80' : 'text-text-secondary opacity-70'}`}>
                          {room.capacity} seats
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${isSelected ? 'text-white' : 'text-primary'}`}>
                          {room.type === 'Lab' ? 'Lab' : 'Room'}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {availableRooms.length === 0 && (
                  <div className="col-span-2 py-12 text-center space-y-3">
                    <p className="text-text-secondary font-bold text-xs">No rooms available for this slot.</p>
                    <button onClick={() => setStep(1)} className="text-primary font-bold text-xs underline">Try another time</button>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Bottom Action Bar so user never has to scroll through all rooms */}
            <div className="fixed bottom-0 left-0 right-0 p-3.5 bg-surface-low/95 dark:bg-surface-mid/95 backdrop-blur-xl border-t border-border-subtle shadow-2xl z-30 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-200">
              <div className="flex-1 min-w-0 font-display">
                {selectedRoomObj ? (
                  <div className="space-y-0.5 truncate">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse"></span>
                      <p className="text-xs font-bold text-text-primary truncate capitalize">
                        Room {selectedRoomObj.name}
                      </p>
                    </div>
                    <p className="text-[10px] text-text-secondary truncate">
                      {selectedRoomObj.capacity} seats • {selectedRoomObj.building || 'Room'}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-text-secondary font-medium">
                    Tap any room to select
                  </p>
                )}
              </div>

              <button 
                disabled={!selectedRoom}
                onClick={() => setStep(3)}
                className="px-5 py-3 rounded-xl bg-primary text-white text-xs font-bold shadow-ambient flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-40 font-display shrink-0"
              >
                <span>Continue</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Details & Confirm */}
        {step === 3 && (
          <div className="space-y-4 animate-in slide-in-from-right duration-300">
            <div className="bg-surface-low p-4 rounded-2xl shadow-sm border border-border-subtle space-y-3 font-display">
               <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center shadow-ambient shrink-0">
                     <Hash size={22} strokeWidth={2.5}/>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-text-primary tracking-tight leading-none mb-1 capitalize">Room {rooms.find(r => r.id === selectedRoom)?.name}</h2>
                    <p className="text-xs font-normal text-text-secondary capitalize">{getDayName(selectedDate)}, {selectedDate.getDate()} @ {selectedHour}:00</p>
                  </div>
               </div>
               <button onClick={() => setStep(2)} className="w-full py-2 bg-surface-mid/50 rounded-xl text-xs font-medium text-primary border border-border-subtle hover:bg-surface-mid">Change Selection</button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary capitalize flex items-center gap-1.5 mb-1 font-display">
                  <Clock size={13} className="text-primary" />
                  Purpose of Booking
                </label>
                <textarea 
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Special Class, Meeting"
                  rows={2}
                  className="w-full bg-surface-low border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs font-medium text-text-primary focus:outline-none focus:border-primary/50 h-14 resize-none transition-all placeholder:text-text-secondary/40 font-body"
                />
              </div>

              {isStudent && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-text-secondary capitalize flex items-center gap-1.5 mb-1 font-display">
                    <User size={13} className="text-primary" />
                    Select Faculty
                  </label>
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setIsFacultyOpen(!isFacultyOpen)}
                      className="w-full bg-surface-low border border-border-subtle rounded-xl px-4 py-3 text-xs font-medium text-text-primary focus:outline-none transition-all flex items-center justify-between font-display capitalize"
                    >
                      <span className={selectedFaculty ? 'text-text-primary font-semibold' : 'text-text-secondary opacity-60'}>
                        {selectedFaculty ? faculties.find(f => String(f.id) === String(selectedFaculty))?.name : 'Choose a Faculty...'}
                      </span>
                      <ChevronRight size={16} className={`transition-transform duration-200 text-secondary ${isFacultyOpen ? 'rotate-90' : ''}`} />
                    </button>

                     {isFacultyOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-surface-low border border-border-subtle rounded-2xl shadow-2xl z-50 max-h-[260px] overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2.5 border-b border-border-subtle bg-surface-low sticky top-0 z-10">
                          <div className="relative">
                            <input 
                              type="text"
                              placeholder="Search faculty name or dept..."
                              value={facultySearch}
                              onChange={(e) => setFacultySearch(e.target.value)}
                              autoFocus
                              className="w-full bg-surface-lowest border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-primary placeholder:text-text-secondary/40 pl-8 focus:outline-none focus:border-primary"
                            />
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/40" size={13} />
                          </div>
                        </div>
                        <div className="overflow-y-auto max-h-[200px]">
                          {faculties
                            ?.filter(f => !debouncedFacultySearch || 
                              f.name.toLowerCase().includes(debouncedFacultySearch.toLowerCase()) || 
                              (f.department && f.department.toLowerCase().includes(debouncedFacultySearch.toLowerCase())))
                            .map(f => {
                              const isSelected = String(selectedFaculty) === String(f.id);
                              return (
                                <div
                                  key={f.id}
                                  onClick={() => {
                                    setSelectedFaculty(f.id);
                                    setIsFacultyOpen(false);
                                    setFacultySearch('');
                                  }}
                                  className={`p-3 cursor-pointer transition-colors flex items-center justify-between hover:bg-surface-mid/50 ${isSelected ? 'bg-primary text-white font-extrabold' : 'font-medium text-text-primary'}`}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-xs font-display capitalize tracking-tight">{f.name}</span>
                                    <span className={`text-[9px] capitalize tracking-wider mt-0.5 ${isSelected ? 'text-white/80' : 'text-text-secondary opacity-70'}`}>
                                      {f.department || 'Faculty'}
                                    </span>
                                  </div>
                                  {isSelected && <CheckCircle size={15} />}
                                </div>
                              );
                            })}
                          {faculties?.filter(f => !debouncedFacultySearch || 
                            f.name.toLowerCase().includes(debouncedFacultySearch.toLowerCase()) || 
                            (f.department && f.department.toLowerCase().includes(debouncedFacultySearch.toLowerCase()))).length === 0 && (
                            <div className="p-4 text-center text-xs text-text-secondary font-medium">No faculty found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button 
              disabled={loading || !purpose || (isStudent && !selectedFaculty)}
              onClick={handleSubmit}
              className="w-full bg-primary text-white font-extrabold py-3.5 rounded-2xl shadow-ambient flex items-center justify-center gap-2 active:scale-95 transition-all text-sm disabled:opacity-40 mt-4 font-display capitalize tracking-tight"
            >
              {loading ? 'Authenticating...' : (
                <>
                  <Sparkles size={24} />
                  Confirm Request
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {/* Custom Conflict Modal */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setIsConflictModalOpen(false);
              setConflictingClass(null);
            }}
          />
          <div className="relative glass w-full max-w-sm rounded-[3rem] p-10 shadow-ambient animate-in zoom-in-95 duration-500 overflow-hidden">
            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-tertiary/10 rounded-full blur-3xl" />
            
            <div className="relative space-y-8 text-center">
              <div className="w-20 h-20 bg-tonal-tertiary text-tertiary rounded-[2rem] flex items-center justify-center mx-auto shadow-tertiary">
                <AlertCircle size={44} strokeWidth={2.5} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-text-primary tracking-tight">Conflict Detected!</h2>
                <p className="text-xs font-bold text-text-secondary capitalize tracking-widest leading-relaxed">
                  You already have a class scheduled for this particular time slot.
                </p>
              </div>

              <div className="bg-tonal-secondary/10 rounded-3xl p-6 text-left space-y-4">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                       <Clock size={20} />
                    </div>
                    <p className="text-sm font-extrabold text-text-primary capitalize tracking-tight font-display">{conflictingClass?.subjectName || conflictingClass?.subject}</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                       <Hash size={18} />
                    </div>
                    <p className="text-[10px] font-extrabold text-text-secondary capitalize tracking-widest leading-relaxed">Room {conflictingClass?.room} <span className="opacity-40">@</span> {conflictingClass?.displayTime}</p>
                 </div>
              </div>

              <p className="text-[11px] text-text-secondary font-medium leading-relaxed px-2">
                This timetable slot is unavailable. Select a different time or faculty member to continue.
              </p>

              <div className="flex flex-col gap-3 pt-3 font-display">
                <button 
                  onClick={() => {
                    setIsConflictModalOpen(false);
                    setConflictingClass(null);
                    setStep(1);
                  }}
                  className="w-full bg-tonal-secondary/10 text-text-secondary font-extrabold py-5 rounded-2xl active:scale-95 transition-all text-[11px] capitalize tracking-widest"
                >
                  Choose Another Time
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileBooking;

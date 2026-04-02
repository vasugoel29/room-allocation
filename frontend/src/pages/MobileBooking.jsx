import React, { useState, useContext } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, Clock, Hash, CheckCircle, AlertCircle, User, ChevronRight, Search, Wind, Monitor, Sparkles, MapPin } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { bookingService } from '../services/bookingService';
import { roomService } from '../services/roomService';
import { getClassConflict, isRoomReallyFree } from '../utils/timetableLogic';
import toast from 'react-hot-toast';
import DatePickerDropdown from '../components/ui/DatePickerDropdown';

function MobileBooking({ onBack }) {
  const { user, rooms, faculties, bookings, availability, fetchRooms, fetchBookings, fetchAvailability } = useContext(AppContext);
  
  const getInitialDate = () => {
    const now = new Date();
    // If past 6 PM, default to tomorrow
    if (now.getHours() >= 18) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      return tomorrow;
    }
    return now;
  };

  const [step, setStep] = useState(1);
  const [selectedDate, setSelectedDate] = useState(getInitialDate());
  const [selectedHour, setSelectedHour] = useState(8);
  const [selectedRoom, setSelectedRoom] = useState('');
  const [purpose, setPurpose] = useState('');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [isFacultyOpen, setIsFacultyOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [roomSearch, setRoomSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');
  const [smartRoomFilter, setSmartRoomFilter] = useState(false);

  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [conflictingClass, setConflictingClass] = useState(null);

  const isStudent = user?.role !== 'ADMIN' && user?.role !== 'FACULTY';

  // Extract unique blocks (buildings) from rooms
  const blocks = ['all', ...new Set(rooms.map(r => r.building).filter(Boolean))];

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
  const HOURS = Array.from({ length: 11 }, (_, i) => i + 8); // 8am to 6pm

  const getDayName = (date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

  // Filter available rooms for the selected slot

  const dayName = getDayName(selectedDate);

  const availableRooms = rooms.filter(room => {
    // Comprehensive availability check (Overides + Static Schedule + Bookings)
    if (!isRoomReallyFree(room, dateStr, dayName, selectedHour, bookings, availability)) {
      return false;
    }

    // 3. Search filter
    if (roomSearch && !room.name.toLowerCase().includes(roomSearch.toLowerCase())) return false;

    // 4. Floor filter
    if (floorFilter !== 'all' && String(room.floor) !== String(floorFilter)) return false;

    // 5. Block filter
    if (blockFilter !== 'all' && room.building !== blockFilter) return false;

    // 6. Smart Room filter (has BOTH AC and Projector)
    if (smartRoomFilter && (!room.has_ac || !room.has_projector)) return false;

    return true;
  });

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    const targetDate = new Date(selectedDate);
    targetDate.setHours(selectedHour, 0, 0, 0);
    const start_time = targetDate.toISOString();
    
    const endDate = new Date(targetDate);
    endDate.setHours(selectedHour + 1);
    const end_time = endDate.toISOString();

    const payload = {
      room_id: selectedRoom,
      start_time,
      end_time,
      faculty_id: isStudent ? selectedFaculty : null,
      purpose: purpose
    };

    try {
      // 1. Check for Class Conflicts
      const isRep = user?.role === 'STUDENT_REP' || user?.role === 'ADMIN';
      const conflict = getClassConflict(user, dateStr, selectedHour, bookings, availability || []);
      
      if (conflict && !conflictingClass) {
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

      const finalPayload = { ...payload };
      if (conflictingClass) {
         // Auto-cancel the old slot
         await roomService.createAvailabilityOverride({
           room_name: conflictingClass.room,
           day: dateStr,
           hour: selectedHour,
           is_available: true,
           reason: `Auto-cancelled for rescheduling to ${selectedRoom}`
         });
         toast.success(`Old class in Room ${conflictingClass.room} cancelled!`);
      }

      await bookingService.createBooking(finalPayload);
      toast.success('Room booked successfully!');
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
      <div className="p-4 flex items-center gap-4 bg-tonal-secondary/10 sticky top-0 z-10 backdrop-blur-md font-display">
        <button onClick={onBack} className="p-2 rounded-full text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <div className="flex flex-col">
          <h1 className="text-xl font-extrabold text-text-primary tracking-tight leading-none uppercase">Create Booking</h1>
          <p className="text-[10px] font-extrabold text-primary uppercase tracking-widest mt-1 opacity-80">Step {step} of 3</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 text-red-600 text-sm flex items-center gap-3 animate-in fade-in zoom-in duration-300">
            <AlertCircle size={20} />
            <p className="font-extrabold tracking-tight uppercase text-[11px] font-display">{error}</p>
          </div>
        )}

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="space-y-3">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 mb-1 font-display opacity-50">
                <CalendarIcon size={14} className="text-primary" />
                Select Date
              </label>
              
              <DatePickerDropdown 
                selectedDate={dateStr}
                onChange={handleDateChange}
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display opacity-50">
                <Clock size={14} className="text-primary" />
                Select Start Time
              </label>
              <div className="grid grid-cols-4 gap-2">
                {HOURS.map(hour => {
                   const now = new Date();
                   const isToday = selectedDate.toDateString() === now.toDateString();
                   const isPast = isToday && hour <= now.getHours();
                   return (
                    <button
                      key={hour}
                      disabled={isPast}
                      onClick={() => setSelectedHour(hour)}
                      className={`py-3.5 rounded-xl text-xs font-extrabold transition-all font-display ${isPast ? 'opacity-10 grayscale cursor-not-allowed' : selectedHour === hour ? 'bg-primary text-white shadow-ambient' : 'bg-tonal-secondary/10 text-text-primary'}`}
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
                const isToday = selectedDate.toDateString() === now.toDateString();
                if (isToday && selectedHour <= now.getHours()) {
                  toast.error("Please select a future time slot");
                  return;
                }
                setStep(2);
              }}
              className="w-full bg-primary text-white font-extrabold py-5 rounded-2xl shadow-ambient flex items-center justify-center gap-3 active:scale-95 transition-all text-lg mt-2 font-display uppercase tracking-tight"
            >
              Next: Select Room
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 2: Room Selection */}
        {step === 2 && (
          <div className="space-y-5 animate-in slide-in-from-right duration-300">
            <div className="bg-tonal-secondary/10 p-5 rounded-3xl flex items-center justify-between shadow-ambient">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                   <CalendarIcon size={20} />
                </div>
                <div className="font-display">
                   <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-secondary opacity-40">Selected Time</p>
                   <p className="text-sm font-extrabold text-text-primary uppercase tracking-tight">{getDayName(selectedDate)}, {selectedDate.getDate()} @ {selectedHour}:00</p>
                </div>
              </div>
              <button onClick={() => setStep(1)} className="text-primary font-extrabold text-[10px] uppercase tracking-widest underline font-display">Edit</button>
            </div>

            {/* Filters */}
            <div className="space-y-4 pt-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    type="text"
                    placeholder="Quick search room..."
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    className="w-full bg-tonal-secondary/10 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:bg-tonal-secondary/20 transition-all pl-11 h-12 font-body font-bold text-text-primary placeholder:text-text-secondary/30"
                  />
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" size={16} />
                </div>
                <button 
                  onClick={() => setSmartRoomFilter(!smartRoomFilter)}
                  className={`px-5 rounded-2xl text-[10px] font-extrabold uppercase tracking-widest transition-all flex items-center gap-2 h-12 font-display ${smartRoomFilter ? 'bg-tertiary text-white shadow-tertiary' : 'bg-tonal-secondary/10 text-text-secondary'}`}
                >
                  <Sparkles size={16} />
                  Smart
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-text-secondary uppercase tracking-[0.2em] ml-1 opacity-40 font-display">Floor Level</label>
                  <div className="flex bg-tonal-secondary/10 p-1.5 rounded-xl">
                    {['all', '0', '1', '2', '3'].map(f => (
                      <button
                        key={f}
                        onClick={() => setFloorFilter(f)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-extrabold transition-all font-display ${floorFilter === f ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
                      >
                        {f === 'all' ? 'ALL' : f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-extrabold text-text-secondary uppercase tracking-[0.2em] ml-1 opacity-40 font-display">Block / Building</label>
                  <div className="flex overflow-x-auto no-scrollbar bg-tonal-secondary/10 p-1.5 rounded-xl gap-1.5">
                    {blocks.map(b => (
                      <button
                        key={b}
                        onClick={() => setBlockFilter(b)}
                        className={`px-5 py-2 rounded-lg text-[10px] font-extrabold transition-all whitespace-nowrap min-w-[70px] font-display ${blockFilter === b ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
                      >
                        {b === 'all' ? 'ALL' : b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 font-display opacity-50">
                <Hash size={14} className="text-primary" />
                Available Spaces
              </label>
              <div className="grid grid-cols-1 gap-4">
                {availableRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    className={`flex items-center justify-between p-4.5 rounded-[1.75rem] transition-all shadow-ambient ${selectedRoom === room.id ? 'bg-primary text-white' : 'bg-surface-low text-text-primary'}`}
                  >
                    <div className="flex items-center gap-4 flex-1 overflow-hidden">
                      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${selectedRoom === room.id ? 'bg-white/20' : 'bg-tonal-secondary/10 text-secondary'}`}>
                        <Hash size={20} />
                      </div>
                      <div className="text-left overflow-hidden">
                        <div className="flex items-center gap-2">
                          <p className="font-extrabold text-lg tracking-tight leading-none truncate font-display uppercase">{room.name}</p>
                          <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded-md shrink-0 font-display ${selectedRoom === room.id ? 'bg-white/10 text-white/80' : 'bg-surface-highest/20 text-text-secondary opacity-60'}`}>
                            {room.building}
                          </span>
                        </div>
                        <p className={`text-[10px] font-extrabold uppercase tracking-widest mt-1.5 font-display ${selectedRoom === room.id ? 'text-white/60' : 'text-text-secondary opacity-40'}`}>{room.capacity} Seats</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 ml-3 shrink-0 opacity-80">
                      <Wind size={15} className={room.has_ac ? (selectedRoom === room.id ? 'text-white' : 'text-primary') : 'text-text-secondary/10'} />
                      <Monitor size={15} className={room.has_projector ? (selectedRoom === room.id ? 'text-white' : 'text-primary') : 'text-text-secondary/10'} />
                    </div>
                  </button>
                ))}
                {availableRooms.length === 0 && (
                  <div className="py-20 text-center space-y-4">
                    <p className="text-text-secondary font-bold">No rooms available for this slot.</p>
                    <button onClick={() => setStep(1)} className="text-accent font-black underline">Try another time</button>
                  </div>
                )}
              </div>
            </div>

            <button 
              disabled={!selectedRoom}
              onClick={() => setStep(3)}
              className="w-full bg-primary text-white font-extrabold py-5 rounded-3xl shadow-ambient flex items-center justify-center gap-3 active:scale-95 transition-all text-lg disabled:opacity-50 font-display uppercase tracking-tight"
            >
              Next: Details
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 3: Details & Confirm */}
        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="bg-tonal-secondary/10 p-6 rounded-[2rem] shadow-ambient space-y-5 font-display">
               <div className="flex items-center gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-ambient">
                     <Hash size={28} strokeWidth={2.5}/>
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-text-primary tracking-tight leading-none mb-1.5 uppercase">Room {rooms.find(r => r.id === selectedRoom)?.name}</h2>
                    <p className="text-[10px] font-extrabold text-text-secondary uppercase tracking-widest opacity-40">{getDayName(selectedDate)}, {selectedDate.getDate()} @ {selectedHour}:00</p>
                  </div>
               </div>
               <button onClick={() => setStep(2)} className="w-full py-3.5 bg-tonal-secondary/10 rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-primary">Change Selection</button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 mb-1 font-display opacity-40">
                  <Clock size={12} className="text-primary" />
                  Purpose of Booking
                </label>
                <textarea 
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Special Class, Meeting"
                  className="w-full bg-tonal-secondary/10 rounded-3xl px-5 py-5 text-sm font-bold text-text-primary focus:outline-none h-28 resize-none transition-all placeholder:text-text-secondary/30 font-body"
                />
              </div>

              {isStudent && (
                <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 mb-1 font-display opacity-40">
                    <User size={12} className="text-primary" />
                    Select Faculty
                  </label>
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setIsFacultyOpen(!isFacultyOpen)}
                      className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-5 text-sm font-extrabold text-text-primary focus:outline-none transition-all flex items-center justify-between font-display uppercase tracking-tight"
                    >
                      <span className={selectedFaculty ? 'text-text-primary' : 'text-text-secondary opacity-40'}>
                        {selectedFaculty ? faculties.find(f => String(f.id) === String(selectedFaculty))?.name : 'Choose a Faculty...'}
                      </span>
                      <ChevronRight size={18} className={`transition-transform duration-200 text-secondary ${isFacultyOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {isFacultyOpen && (
                      <div className="absolute top-full left-0 right-0 mt-3 bg-neutral rounded-3xl shadow-ambient z-50 max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-md">
                        {faculties.map(f => (
                          <div
                            key={f.id}
                            onClick={() => {
                              setSelectedFaculty(f.id);
                              setIsFacultyOpen(false);
                            }}
                            className={`p-5 cursor-pointer transition-colors flex items-center justify-between hover:bg-white/5 ${String(selectedFaculty) === String(f.id) ? 'bg-primary text-white font-extrabold' : 'font-extrabold text-white/60'}`}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-display uppercase tracking-tight">{f.name}</span>
                              <span className={`text-[9px] uppercase tracking-widest mt-0.5 ${String(selectedFaculty) === String(f.id) ? 'text-white/60' : 'text-text-secondary opacity-40'}`}>
                                {f.department || 'Faculty'}
                              </span>
                            </div>
                            {String(selectedFaculty) === String(f.id) && <CheckCircle size={18} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button 
              disabled={loading || !purpose || (isStudent && !selectedFaculty)}
              onClick={handleSubmit}
              className="w-full bg-primary text-white font-extrabold py-5 rounded-[2rem] shadow-ambient flex items-center justify-center gap-3 active:scale-95 transition-all text-xl disabled:opacity-50 mt-10 font-display uppercase tracking-tight"
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
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest leading-relaxed">
                  You already have a class scheduled for this particular time slot.
                </p>
              </div>

              <div className="bg-tonal-secondary/10 rounded-3xl p-6 text-left space-y-4">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                       <Clock size={20} />
                    </div>
                    <p className="text-sm font-extrabold text-text-primary uppercase tracking-tight font-display">{conflictingClass?.subjectName || conflictingClass?.subject}</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                       <Hash size={18} />
                    </div>
                    <p className="text-[10px] font-extrabold text-text-secondary uppercase tracking-widest leading-relaxed">Room {conflictingClass?.room} <span className="opacity-40">@</span> {conflictingClass?.displayTime}</p>
                 </div>
              </div>

              <p className="text-[11px] text-text-secondary font-medium leading-relaxed px-2">
                Would you like to <span className="text-red-500 font-black">CANCEL</span> that class to free up the room and proceed with your new booking?
              </p>

              <div className="flex flex-col gap-3 pt-3 font-display">
                <button 
                  onClick={handleSubmit}
                  className="w-full bg-primary text-white font-extrabold py-5 rounded-2xl shadow-ambient active:scale-95 transition-all text-[11px] uppercase tracking-widest"
                >
                  Confirm & Resolve Conflict
                </button>
                <button 
                  onClick={() => {
                    setIsConflictModalOpen(false);
                    setConflictingClass(null);
                  }}
                  className="w-full bg-tonal-secondary/10 text-text-secondary font-extrabold py-5 rounded-2xl active:scale-95 transition-all text-[11px] uppercase tracking-widest"
                >
                  Return to Booking
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

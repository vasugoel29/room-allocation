import React, { useState, useContext } from 'react';
import { ArrowLeft, Calendar as CalendarIcon, Clock, Hash, CheckCircle, AlertCircle, User, ChevronRight, Search, Wind, Monitor, Sparkles } from 'lucide-react';
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

  const isStudent = user?.role !== 'admin' && user?.role !== 'FACULTY';

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
  const slotDateStr = selectedDate.toDateString();
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
      const isRep = user?.role === 'STUDENT_REP' || user?.role === 'admin';
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
    <div className="flex flex-col h-full w-full bg-bg-primary fixed inset-0 z-[60] overflow-y-auto no-scrollbar pb-20">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-4 bg-bg-secondary/30 sticky top-0 z-10 backdrop-blur-md">
        <button onClick={onBack} className="p-2 hover:bg-black/5 rounded-full text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-black text-text-primary tracking-tight leading-none">Create Booking</h1>
          <p className="text-[10px] font-bold text-accent uppercase tracking-widest mt-1">Step {step} of 3</p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-3 animate-in fade-in zoom-in duration-300">
            <AlertCircle size={20} />
            <p className="font-bold">{error}</p>
          </div>
        )}

        {/* Step 1: Date & Time */}
        {step === 1 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="space-y-3">
              <label className="text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2 mb-1">
                <CalendarIcon size={14} className="text-accent" />
                Select Date
              </label>
              
              <DatePickerDropdown 
                selectedDate={dateStr}
                onChange={handleDateChange}
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2">
                <Clock size={14} className="text-accent" />
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
                      className={`py-2.5 rounded-xl border text-xs font-black transition-all ${isPast ? 'opacity-20 grayscale cursor-not-allowed border-border' : selectedHour === hour ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-bg-secondary border-border text-text-primary hover:border-accent/40'}`}
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
              className="w-full bg-accent text-white font-black py-4 rounded-2xl shadow-xl shadow-accent/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg mt-2"
            >
              Next: Select Room
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 2: Room Selection */}
        {step === 2 && (
          <div className="space-y-5 animate-in slide-in-from-right duration-300">
            <div className="bg-bg-secondary/50 p-4 rounded-2xl border border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                   <CalendarIcon size={20} />
                </div>
                <div>
                   <p className="text-xs font-black uppercase tracking-widest text-text-secondary">Selected Time</p>
                   <p className="font-bold text-text-primary">{getDayName(selectedDate)}, {selectedDate.getDate()} @ {selectedHour}:00</p>
                </div>
              </div>
              <button onClick={() => setStep(1)} className="text-accent font-black text-xs uppercase tracking-widest underline">Edit</button>
            </div>

            {/* Filters */}
            <div className="space-y-4 pt-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    type="text"
                    placeholder="Search room..."
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    className="w-full bg-bg-secondary/30 border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition-all pl-10 h-11"
                  />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary/30" size={14} />
                </div>
                <button 
                  onClick={() => setSmartRoomFilter(!smartRoomFilter)}
                  className={`px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 h-11 ${smartRoomFilter ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-bg-secondary/20 border-border text-text-secondary'}`}
                >
                  <Sparkles size={14} />
                  Smart
                </button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-text-secondary uppercase tracking-widest ml-1 opacity-50">Floor Level</label>
                  <div className="flex bg-bg-secondary/40 p-1 rounded-xl border border-border/50">
                    {['all', '0', '1', '2', '3'].map(f => (
                      <button
                        key={f}
                        onClick={() => setFloorFilter(f)}
                        className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${floorFilter === f ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                      >
                        {f === 'all' ? 'ALL' : f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-text-secondary uppercase tracking-widest ml-1 opacity-50">Block / Building</label>
                  <div className="flex overflow-x-auto no-scrollbar bg-bg-secondary/40 p-1 rounded-xl border border-border/50 gap-1">
                    {blocks.map(b => (
                      <button
                        key={b}
                        onClick={() => setBlockFilter(b)}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all whitespace-nowrap min-w-[60px] ${blockFilter === b ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
                      >
                        {b === 'all' ? 'ALL' : b}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-2">
                <Hash size={14} className="text-accent" />
                Choose Available Room
              </label>
              <div className="grid grid-cols-1 gap-3">
                {availableRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => setSelectedRoom(room.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedRoom === room.id ? 'bg-accent border-accent text-white shadow-lg shadow-accent/20' : 'bg-bg-secondary border-border text-text-primary hover:border-accent/40'}`}
                  >
                    <div className="flex items-center gap-4 flex-1 overflow-hidden">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selectedRoom === room.id ? 'bg-white/20' : 'bg-bg-primary text-text-secondary'} border border-black/5`}>
                        <Hash size={18} />
                      </div>
                      <div className="text-left overflow-hidden">
                        <div className="flex items-center gap-2">
                          <p className="font-black text-lg tracking-tight leading-none truncate">{room.name}</p>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-full border shrink-0 ${selectedRoom === room.id ? 'bg-white/10 border-white/20 text-white/80' : 'bg-bg-primary border-border text-text-secondary opacity-60'}`}>
                            {room.building}
                          </span>
                        </div>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mt-1.5 ${selectedRoom === room.id ? 'text-white/60' : 'text-text-secondary'}`}>{room.capacity} Seats</p>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 ml-3 shrink-0 opacity-80">
                      <Wind size={14} className={room.has_ac ? (selectedRoom === room.id ? 'text-white' : 'text-accent') : 'text-red-500/30'} />
                      <Monitor size={14} className={room.has_projector ? (selectedRoom === room.id ? 'text-white' : 'text-accent') : 'text-red-500/30'} />
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
              className="w-full bg-accent text-white font-black py-4 rounded-2xl shadow-xl shadow-accent/20 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg disabled:opacity-50"
            >
              Next: Booking Details
              <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 3: Details & Confirm */}
        {step === 3 && (
          <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="bg-bg-secondary/50 p-5 rounded-3xl border border-border space-y-4">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/20">
                     <Hash size={24} strokeWidth={2.5}/>
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-text-primary tracking-tight leading-none mb-1">Room {rooms.find(r => r.id === selectedRoom)?.name}</h2>
                    <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">{getDayName(selectedDate)}, {selectedDate.getDate()} @ {selectedHour}:00</p>
                  </div>
               </div>
               <button onClick={() => setStep(2)} className="w-full py-2 bg-bg-primary border border-border rounded-xl text-[10px] font-black uppercase tracking-widest text-text-secondary">Change Room</button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-black text-text-secondary uppercase tracking-widest flex items-center gap-2">
                  <Clock size={12} className="text-accent" />
                  Purpose of Booking
                </label>
                <textarea 
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Special Class, Meeting"
                  className="w-full bg-bg-secondary border border-border rounded-2xl px-4 py-4 text-sm font-bold text-text-primary focus:outline-none focus:border-accent h-24 resize-none transition-all placeholder:font-medium shadow-inner"
                />
              </div>

              {isStudent && (
                <div className="space-y-2">
                  <label className="text-xs font-black text-text-secondary uppercase tracking-widest flex items-center gap-2">
                    <User size={12} className="text-accent" />
                    Select Faculty
                  </label>
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setIsFacultyOpen(!isFacultyOpen)}
                      className="w-full bg-bg-secondary border border-border rounded-2xl px-4 py-4 text-sm font-black text-text-primary focus:outline-none focus:border-accent transition-all shadow-inner flex items-center justify-between"
                    >
                      <span className={selectedFaculty ? 'text-text-primary' : 'text-text-secondary opacity-50'}>
                        {selectedFaculty ? faculties.find(f => String(f.id) === String(selectedFaculty))?.name : 'Choose a Faculty...'}
                      </span>
                      <ChevronRight size={18} className={`transition-transform duration-200 ${isFacultyOpen ? 'rotate-90' : ''}`} />
                    </button>

                    {isFacultyOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-2xl shadow-2xl z-50 max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 glass">
                        {faculties.map(f => (
                          <div
                            key={f.id}
                            onClick={() => {
                              setSelectedFaculty(f.id);
                              setIsFacultyOpen(false);
                            }}
                            className={`p-4 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center justify-between hover:bg-accent/10 ${String(selectedFaculty) === String(f.id) ? 'bg-accent text-white font-black' : 'font-bold text-text-primary'}`}
                          >
                            <span className="text-sm">{f.name}</span>
                            {String(selectedFaculty) === String(f.id) && <CheckCircle size={16} />}
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
              className="w-full bg-accent text-white font-black py-4 rounded-3xl shadow-2xl shadow-accent/30 flex items-center justify-center gap-3 active:scale-95 transition-all text-xl disabled:opacity-50 mt-10"
            >
              {loading ? 'Creating Booking...' : (
                <>
                  <CheckCircle size={24} />
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
          <div className="relative glass w-full max-w-sm rounded-[2.5rem] border border-white/20 p-8 shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent/20 rounded-full blur-3xl" />
            
            <div className="relative space-y-6 text-center">
              <div className="w-20 h-20 bg-amber-500/20 text-amber-500 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-amber-500/10">
                <AlertCircle size={40} strokeWidth={2.5} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-text-primary tracking-tight">Conflict Detected!</h2>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest leading-relaxed">
                  You already have a class scheduled for this particular time slot.
                </p>
              </div>

              <div className="bg-bg-primary/50 border border-border rounded-2xl p-4 text-left space-y-3">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                       <Clock size={16} />
                    </div>
                    <p className="text-sm font-black text-text-primary">{conflictingClass?.subjectName || conflictingClass?.subject}</p>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                       <MapPin size={16} />
                    </div>
                    <p className="text-xs font-bold text-text-secondary italic uppercase tracking-widest">Room {conflictingClass?.room} @ {conflictingClass?.displayTime}</p>
                 </div>
              </div>

              <p className="text-[11px] text-text-secondary font-medium leading-relaxed px-2">
                Would you like to <span className="text-red-500 font-black">CANCEL</span> that class to free up the room and proceed with your new booking?
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={handleSubmit}
                  className="w-full bg-accent text-white font-black py-4 rounded-2xl shadow-lg shadow-accent/20 active:scale-95 transition-all text-sm"
                >
                  Confirm & Cancel Class
                </button>
                <button 
                  onClick={() => {
                    setIsConflictModalOpen(false);
                    setConflictingClass(null);
                  }}
                  className="w-full bg-bg-secondary border border-border text-text-secondary font-black py-4 rounded-2xl active:scale-95 transition-all text-sm"
                >
                  Go Back
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

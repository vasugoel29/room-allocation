import React, { useState, useContext, useMemo } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, X, ChevronLeft, ChevronRight, Filter, AlertCircle, Trash2, Lightbulb, Calendar } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { roomService } from '../services/roomService';
import { bookingService } from '../services/bookingService';
import { getMergedSchedule, getHourFromTime } from '../utils/timetableLogic';
import toast from 'react-hot-toast';

import PageSearch from '../components/ui/PageSearch';

const Timetable = () => {
  const { user, selectedDay, setSelectedDay, bookings, availability, fetchAvailability, timetableData, facultyTimetableData, facultyOverrides } = useContext(AppContext);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [pendingCancelClass, setPendingCancelClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Helper: Format date for display
  const formatDateDisplay = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  // Permission check
  const { fetchBookings, fetchFacultyOverrides } = useContext(AppContext);
  const isRep = user?.role === 'STUDENT_REP' || user?.role === 'ADMIN';
  const isFaculty = user?.role === 'FACULTY';

  // Filter and Merge Timetable Data
  const mergedSchedule = useMemo(() => {
    const merged = getMergedSchedule(user, selectedDay, bookings, availability || [], timetableData, facultyTimetableData, facultyOverrides);
    
    if (!searchTerm) return merged;
    
    const search = searchTerm.toLowerCase();
    return merged.filter(item => 
      item.subjectName?.toLowerCase().includes(search) || 
      item.subject?.toLowerCase().includes(search) || 
      item.room?.toLowerCase().includes(search) ||
      item.instructor?.toLowerCase().includes(search)
    );
  }, [user, selectedDay, bookings, availability, searchTerm, timetableData, facultyTimetableData, facultyOverrides]);

  const handleCancelClass = (classItem) => {
    setPendingCancelClass(classItem);
    setIsCancelModalOpen(true);
  };

  const performCancel = async () => {
    if (!pendingCancelClass) return;
    
    setIsCancelling(true);
    try {
      const hour = getHourFromTime(pendingCancelClass.time);

      if (isFaculty) {
        if (pendingCancelClass.isDynamic) {
          await bookingService.cancelBooking(pendingCancelClass.bookingId);
          toast.success(`Booking cancelled`);
        } else {
          await roomService.overrideFacultySlot({ date: selectedDay, hour });
          toast.success(`Class marked available`);
        }
        fetchFacultyOverrides?.();
        fetchBookings?.();
      } else {
        await roomService.createAvailabilityOverride({
          room_name: pendingCancelClass.room,
          day: selectedDay,
          hour: hour,
          is_available: true,
          reason: `Class ${pendingCancelClass.subjectName} cancelled by Rep`
        });
        toast.success(`Room ${pendingCancelClass.room} is now available!`);
      }

      fetchAvailability(); 
      setIsCancelModalOpen(false);
      setPendingCancelClass(null);
    } catch (err) {
      toast.error(err.message || 'Failed to cancel class');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-80px)] space-y-4 p-5 sm:p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div className="flex flex-col">
          <h1 className="text-xl font-black text-text-primary tracking-tighter uppercase italic">Academic Timetable</h1>
          <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mt-0.5">{formatDateDisplay(selectedDay)}</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <PageSearch 
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search classes..."
            className="flex-1 sm:w-48"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => {
                const d = new Date(selectedDay);
                d.setDate(d.getDate() - 1);
                setSelectedDay(d.toISOString().split('T')[0]);
              }}
              className="p-2 bg-bg-secondary border border-border rounded-xl text-text-secondary hover:text-text-primary transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={() => {
                const d = new Date(selectedDay);
                d.setDate(d.getDate() + 1);
                setSelectedDay(d.toISOString().split('T')[0]);
              }}
              className="p-2 bg-bg-secondary border border-border rounded-xl text-text-secondary hover:text-text-primary transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {isRep && (
        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 flex gap-4 shrink-0 animate-in slide-in-from-top-4 duration-500">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-white shrink-0 shadow-lg shadow-accent/20">
            <Lightbulb size={20} />
          </div>
          <div>
            <h4 className="text-xs font-black text-accent uppercase tracking-widest">Pro Tip for Reps</h4>
            <p className="text-[11px] text-text-secondary font-bold leading-relaxed mt-1">If a class is cancelled, tap the trash icon to free up the room for others. This will mark it as available in the booking search.</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-6">
        {mergedSchedule.length > 0 ? (
          mergedSchedule.map((item, index) => (
            <div 
              key={index}
              className={`bg-bg-secondary/50 border border-border rounded-2xl p-4 flex items-center justify-between hover:border-accent/30 transition-all shadow-sm ${item.isDynamic ? 'border-l-4 border-l-accent ring-1 ring-accent/5' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.isDynamic ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-bg-primary text-text-secondary border border-border'}`}>
                  {item.isDynamic ? <Calendar size={18} /> : <MapPin size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-text-primary leading-none">{item.subjectName || item.subject}</h3>
                    {item.isDynamic && <span className="text-[8px] font-black bg-accent/20 text-accent px-1.5 py-0.5 rounded-full uppercase tracking-tighter">Updated</span>}
                  </div>
                  {item.isDynamic && (
                    <div className="mt-1">
                      {user.role === 'FACULTY' ? (
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{item.className}</p>
                      ) : (
                        <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Faculty: {item.faculty}</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] text-text-secondary font-black flex items-center gap-1.5 uppercase tracking-tighter">
                      <Clock size={12} className="text-accent" /> 
                      {item.displayTime}
                    </span>
                    <span className="text-[11px] text-accent font-black uppercase tracking-tighter bg-accent/5 px-2 py-0.5 rounded-lg border border-accent/10">
                      {item.room}
                    </span>
                  </div>
                </div>
              </div>
              
              {(isRep || isFaculty) && (
                <button 
                  onClick={() => handleCancelClass(item)}
                  disabled={isCancelling}
                  className="p-2.5 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90 bg-bg-primary border border-border hover:border-red-500/30"
                  title={isFaculty ? "Cancel session" : "Mark available"}
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
            <div className="w-16 h-16 bg-bg-secondary rounded-3xl flex items-center justify-center text-text-secondary mb-4 border border-border">
              <AlertCircle size={32} />
            </div>
            <p className="text-xs text-text-secondary font-black uppercase tracking-widest">No classes scheduled for this day</p>
          </div>
        )}
      </div>

      {/* Custom Cancellation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setIsCancelModalOpen(false);
              setPendingCancelClass(null);
            }}
          />
          <div className="relative glass w-full max-w-sm rounded-[2.5rem] border border-white/20 p-8 shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/20 rounded-full blur-3xl opacity-50" />
            
            <div className="relative space-y-6 text-center">
              <div className="w-20 h-20 bg-red-500/20 text-red-500 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-red-500/10">
                <Trash2 size={40} strokeWidth={2.5} />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-black text-text-primary tracking-tight">Free This Room?</h2>
                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest leading-relaxed px-4">
                  This class will be marked as cancelled for this specific date only.
                </p>
              </div>

              <div className="bg-bg-primary/50 border border-border rounded-2xl p-4 text-left space-y-3">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                       <Clock size={16} />
                    </div>
                    <p className="text-sm font-black text-text-primary">{pendingCancelClass?.subjectName || pendingCancelClass?.subject}</p>
                 </div>
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
                       <MapPin size={16} />
                    </div>
                    <p className="text-xs font-bold text-text-secondary italic uppercase tracking-widest">Room {pendingCancelClass?.room} @ {pendingCancelClass?.displayTime}</p>
                 </div>
              </div>

              <p className="text-[11px] text-text-secondary font-medium leading-relaxed px-2">
                Once confirmed, this room will become <span className="text-accent font-black">AVAILABLE</span> in the search results for others to book.
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={performCancel}
                  disabled={isCancelling}
                  className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition-all text-sm disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
                <button 
                  onClick={() => {
                    setIsCancelModalOpen(false);
                    setPendingCancelClass(null);
                  }}
                  className="w-full bg-bg-secondary border border-border text-text-secondary font-black py-4 rounded-2xl active:scale-95 transition-all text-sm"
                >
                  Keep Class
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Timetable;

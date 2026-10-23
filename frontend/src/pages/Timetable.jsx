import React, { useState, useContext, useMemo } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, X, ChevronLeft, ChevronRight, Filter, AlertCircle, Trash2, Lightbulb, Calendar, User } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { roomService } from '../services/roomService';
import { bookingService } from '../services/bookingService';
import { getMergedSchedule, getHourFromTime } from '../utils/timetableLogic';
import toast from 'react-hot-toast';

import PageSearch from '../components/ui/PageSearch';

import { getDatesOfWeek } from '../utils/dateHelpers';
import { WeekView } from '../components/ui/WeekView';
import { toTitleCase } from '../utils/roleUtils';
import { P, can, teaches, isAdmin } from '../utils/permissions';

const Timetable = () => {
  const { user, selectedDay, setSelectedDay, bookings, availability, fetchAvailability, timetableData, facultyTimetableData, facultyOverrides } = useContext(AppContext);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [pendingCancelClass, setPendingCancelClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week'

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

  const formatWeekDisplay = (dateStr) => {
    const dates = getDatesOfWeek(dateStr);
    const first = new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const last = new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${first} - ${last}`;
  };

  // Permission check
  const { fetchBookings, fetchFacultyOverrides, fetchTimetable } = useContext(AppContext);
  // Ask for a class to be cancelled (cras.bookings) / cancel your own class (Faculty Portal + teaching).
  const isRep = can(user, P.BOOKINGS);
  const isFaculty = teaches(user) && can(user, P.FACULTY_PORTAL);

  const weeklySchedule = useMemo(() => {
    if (viewMode !== 'week') return {};
    const dates = getDatesOfWeek(selectedDay);
    const weekData = {};
    
    dates.forEach(date => {
      const merged = getMergedSchedule(user, date, bookings, availability || [], timetableData, facultyTimetableData, facultyOverrides);
      
      const filtered = !searchTerm ? merged : merged.filter(item => 
        item.subjectName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.subject?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.room?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.faculty?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.instructor?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
      weekData[dayName] = {
        date,
        slots: filtered
      };
    });
    
    return weekData;
  }, [viewMode, user, selectedDay, bookings, availability, searchTerm, timetableData, facultyTimetableData, facultyOverrides]);

  // Filter and Merge Timetable Data
  const mergedSchedule = useMemo(() => {
    const merged = getMergedSchedule(user, selectedDay, bookings, availability || [], timetableData, facultyTimetableData, facultyOverrides);
    
    if (!searchTerm) return merged;
    
    const search = searchTerm.toLowerCase();
    return merged.filter(item => 
      item.subjectName?.toLowerCase().includes(search) || 
      item.subject?.toLowerCase().includes(search) || 
      item.room?.toLowerCase().includes(search) ||
      item.faculty?.toLowerCase().includes(search) ||
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
        const result = await roomService.requestClassCancellation({
          room_name: pendingCancelClass.room,
          date: selectedDay,
          hour: hour,
          subject_name: pendingCancelClass.subjectName || pendingCancelClass.subject,
          faculty_name: pendingCancelClass.faculty,
          booking_id: pendingCancelClass.isDynamic ? pendingCancelClass.bookingId : null
        });
        toast.success(result.message);
      }

      fetchAvailability(); 
      fetchTimetable?.();
      setIsCancelModalOpen(false);
      setPendingCancelClass(null);
    } catch (err) {
      toast.error(err.message || 'Failed to cancel class');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100%' }}>
      {/* ── Header Controls ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-border-subtle bg-surface-low/50">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-surface-lowest border border-border-subtle text-xs font-semibold text-text-primary">
            {viewMode === 'day' ? formatDateDisplay(selectedDay) : formatWeekDisplay(selectedDay)}
          </span>
        </div>
        
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="inline-flex p-1 bg-surface-lowest rounded-xl border border-border-subtle shrink-0">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${viewMode === 'day' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-150 ${viewMode === 'week' ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              Week
            </button>
          </div>
          <PageSearch 
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search classes..."
            className="flex-1 sm:w-48"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              onClick={() => {
                const d = new Date(selectedDay);
                d.setDate(d.getDate() - (viewMode === 'day' ? 1 : 7));
                setSelectedDay(d.toISOString().split('T')[0]);
              }}
              className="p-2 bg-surface-lowest border border-border-subtle rounded-xl text-text-secondary hover:text-text-primary transition-all"
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              onClick={() => {
                const d = new Date(selectedDay);
                d.setDate(d.getDate() + (viewMode === 'day' ? 1 : 7));
                setSelectedDay(d.toISOString().split('T')[0]);
              }}
              className="p-2 bg-surface-lowest border border-border-subtle rounded-xl text-text-secondary hover:text-text-primary transition-all"
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {isRep && (
        <div className="bg-accent/10 border border-accent/20 rounded-2xl p-3 sm:p-3.5 flex gap-3 shrink-0 mx-4 sm:mx-6 my-3">
          <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-white shrink-0 shadow-sm">
            <Lightbulb size={16} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-accent capitalize">Pro Tip for Reps</h4>
            <p className="text-[11px] text-text-secondary font-medium leading-relaxed mt-0.5">Request a class cancellation here. The room becomes available only after the assigned faculty member approves it.</p>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 sm:px-6 pb-6 overscroll-contain">
        <div key={viewMode} className="tab-content-enter">
        {viewMode === 'day' ? (
          <div className="space-y-2.5">
            {mergedSchedule.length > 0 ? (
              mergedSchedule.map((item, index) => (
                <div 
                  key={index}
                  className={`bg-surface-low border border-border-subtle rounded-2xl p-3.5 sm:p-4 flex items-center justify-between hover:border-accent/40 transition-all shadow-sm ${item.isDynamic ? 'border-l-4 border-l-accent' : ''}`}
                >
                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${item.isDynamic ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-surface-lowest text-text-secondary border border-border-subtle'}`}>
                      {item.isDynamic ? <Calendar size={18} /> : <MapPin size={18} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-text-primary leading-none">{item.subjectName || item.subject}</h3>
                        {item.isDynamic && <span className="text-[8px] font-black bg-accent/20 text-accent px-1.5 py-0.5 rounded-full capitalize tracking-tighter">Updated</span>}
                      </div>
                      {item.isDynamic && item.className && (teaches(user) || isAdmin(user)) && (
                        <div className="mt-1">
                          <p className="text-[10px] font-bold text-text-secondary capitalize tracking-widest">{item.className}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5 sm:gap-3 mt-1.5 flex-wrap">
                        <span className="text-[11px] text-text-secondary font-bold flex items-center gap-1.5 capitalize tracking-tighter">
                          <Clock size={12} className="text-accent" /> 
                          {item.displayTime}
                        </span>
                        <span className="text-[11px] text-accent font-black capitalize tracking-tighter bg-accent/5 px-2 py-0.5 rounded-lg border border-accent/15">
                          {item.room}
                        </span>
                        {!isFaculty && item.faculty && (
                          <span className="text-[11px] text-text-secondary font-bold flex items-center gap-1.5 capitalize tracking-tighter">
                            <User size={12} className="text-accent" />
                            {toTitleCase(item.faculty)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {(isRep || isFaculty) && (
                    <button 
                      onClick={() => handleCancelClass(item)}
                      disabled={isCancelling}
                      className="p-2 sm:p-2.5 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all active:scale-90 bg-surface-lowest border border-border-subtle hover:border-red-500/30"
                      title={isFaculty ? "Cancel session" : "Mark available"}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                <div className="w-16 h-16 bg-surface-low rounded-3xl flex items-center justify-center text-text-secondary mb-4 border border-border-subtle">
                  <AlertCircle size={32} />
                </div>
                <p className="text-xs text-text-secondary font-black capitalize tracking-widest">No classes scheduled for this day</p>
              </div>
            )}
          </div>
        ) : (
          <WeekView
            weeklySchedule={weeklySchedule}
            accentColor="accent"
            renderSlotSubtitle={(item) => {
              const admin = isAdmin(user);
              const isFaculty = teaches(user);
              const isStudent = !admin && !isFaculty;
              return (
                <>
                  {item.className && (admin || isFaculty) && (
                    <p className="text-[10px] font-semibold text-text-secondary mt-1">{item.className}</p>
                  )}
                  {item.faculty && (isAdmin || isStudent) && (
                    <p className="text-[10px] font-semibold text-text-secondary mt-1 flex items-center gap-1">
                      <User size={10} className="shrink-0 text-text-secondary/60" />
                      {toTitleCase(item.faculty)}
                    </p>
                  )}
                </>
              );
            }}
            renderSlotActions={(item) =>
              (isRep || isFaculty) && (
                <button
                  onClick={() => handleCancelClass(item)}
                  disabled={isCancelling}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] font-black text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl py-1.5 border border-red-500/20 hover:border-red-500/40 transition-all"
                >
                  <Trash2 size={10} /> Cancel
                </button>
              )
            }
          />
        )}
        </div>
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
                <p className="text-xs font-bold text-text-secondary capitalize tracking-widest leading-relaxed px-4">
                  This cancellation will be sent to the class faculty member for approval.
                </p>
              </div>

              <div className="bg-surface-low border border-border-subtle rounded-2xl p-4 text-left space-y-3">
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
                    <p className="text-xs font-bold text-text-secondary italic capitalize tracking-widest">Room {pendingCancelClass?.room} @ {pendingCancelClass?.displayTime}</p>
                 </div>
              </div>

              <p className="text-[11px] text-text-secondary font-medium leading-relaxed px-2">
                The room will become <span className="text-accent font-black">AVAILABLE</span> only after faculty approval.
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <button 
                  onClick={performCancel}
                  disabled={isCancelling}
                  className="w-full bg-red-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-red-600/20 active:scale-95 transition-all text-sm disabled:opacity-50"
                >
                  {isCancelling ? 'Sending Request...' : 'Request Cancellation'}
                </button>
                <button 
                  onClick={() => {
                    setIsCancelModalOpen(false);
                    setPendingCancelClass(null);
                  }}
                  className="w-full bg-surface-low border border-border-subtle text-text-secondary font-black py-4 rounded-2xl active:scale-95 transition-all text-sm"
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

import React, { useState } from 'react';
import { X, AlertTriangle, Clock, User, BookOpen } from 'lucide-react';
import { formatTo24h, getClassConflict } from '../../utils/timetableLogic';
import { roomService } from '../../services/roomService';

const BOOKING_HOURS = Array.from({ length: 10 }, (_, index) => index + 8); // 08:00–18:00 IST

function ConflictResolutionDialog({ conflict, onCancel, facultyId, facultyName, user, bookings = [], availability = [], timetableData = [] }) {
  const isFacultyBusy = conflict?.type === 'faculty_busy' || /selected faculty timetable/i.test(conflict?.label || '');
  const [availableSlots, setAvailableSlots] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const showAvailableSlots = async () => {
    if (!facultyId || !conflict?.date) return;
    setLoadingSlots(true);
    try {
      const checks = await Promise.all(BOOKING_HOURS.map(async (hour) => ({ hour, ...(await roomService.checkFacultyAvailability(facultyId, conflict.date, hour)) })));
      
      const freeSlots = checks.filter((slot) => {
        // 1. Faculty must be free
        if (slot.isOccupied) return false;
        
        // 2. Student section must be free (if student role)
        const isStudent = user?.role !== 'ADMIN' && user?.role !== 'FACULTY';
        if (isStudent) {
          const hasClash = getClassConflict(user, conflict.date, slot.hour, bookings, availability, timetableData);
          if (hasClash) return false;
        }
        return true;
      });

      setAvailableSlots(freeSlots.map((slot) => slot.hour));
    } catch (err) {
      console.error(err);
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-md"
        onClick={onCancel}
        aria-hidden="true"
        tabIndex="-1"
      />

      <div className="relative w-full max-w-md glass rounded-[2.5rem] p-6 sm:p-8 shadow-ambient border-none max-h-[90dvh] overflow-y-auto no-scrollbar">
        <button
          onClick={onCancel}
          aria-label="Close modal"
          className="absolute top-4 right-4 p-2 hover:bg-tonal-secondary/10 rounded-full text-text-secondary transition-all"
        >
          <X size={20} />
        </button>

        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 rounded-full bg-red-500/15 text-red-500 flex-shrink-0">
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-text-primary font-display capitalize tracking-tight">
              {availableSlots ? 'Available Slots' : (isFacultyBusy ? 'Faculty Unavailable' : 'Class Conflict')}
            </h2>
            <p className="text-text-secondary text-xs sm:text-sm font-bold opacity-40 capitalize tracking-widest mt-1">
              {availableSlots ? `Available times for ${facultyName || 'the selected faculty member'}` : (isFacultyBusy ? 'The selected faculty member is busy' : 'An existing class is scheduled for this time')}
            </p>
          </div>
        </div>

        {availableSlots ? (
          <div className="bg-surface-mid rounded-2xl p-4 sm:p-5 mb-6">
            {availableSlots.length ? <div className="grid grid-cols-2 gap-2">{availableSlots.map((hour) => <span key={hour} className="rounded-xl bg-surface-high px-3 py-2 text-center text-sm font-extrabold text-text-primary">{String(hour).padStart(2, '0')}:00 – {String(hour + 1).padStart(2, '0')}:00</span>)}</div> : <p className="text-sm font-bold text-text-secondary">No available slots remain from 08:00 to 18:00 IST.</p>}
          </div>
        ) : !isFacultyBusy && <div className="bg-surface-mid rounded-2xl p-4 sm:p-5 mb-6 space-y-4">
          <div className="space-y-3">
            {conflict?.subject && (
              <div className="flex items-start gap-3">
                <BookOpen size={18} className="text-primary mt-1 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-text-secondary text-xs font-bold capitalize tracking-widest opacity-60">
                    Subject
                  </p>
                  <p className="text-text-primary font-extrabold text-sm sm:text-base truncate">
                    {conflict.subject}
                  </p>
                </div>
              </div>
            )}

            {conflict?.faculty && (
              <div className="flex items-start gap-3">
                <User size={18} className="text-primary mt-1 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-text-secondary text-xs font-bold capitalize tracking-widest opacity-60">
                    Faculty
                  </p>
                  <p className="text-text-primary font-extrabold text-sm sm:text-base truncate">
                    {conflict.faculty}
                  </p>
                </div>
              </div>
            )}

            {conflict?.room && (
              <div className="flex items-start gap-3">
                <BookOpen size={18} className="text-primary mt-1 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-text-secondary text-xs font-bold capitalize tracking-widest opacity-60">
                    Room
                  </p>
                  <p className="text-text-primary font-extrabold text-sm sm:text-base truncate">
                    {conflict.room}
                  </p>
                </div>
              </div>
            )}

            {(conflict?.day || conflict?.time) && (
              <div className="flex items-start gap-3">
                <Clock size={18} className="text-primary mt-1 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-text-secondary text-xs font-bold capitalize tracking-widest opacity-60">
                    Scheduled Time
                  </p>
                  <p className="text-text-primary font-extrabold text-sm sm:text-base">
                    {conflict.day} {conflict.time ? formatTo24h(conflict.time) : 'Unknown time'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>}

        <p className="text-text-secondary text-xs sm:text-sm font-bold mb-6 leading-relaxed">
          {!availableSlots && (isFacultyBusy
            ? 'The selected faculty member is busy during this slot. Please choose a different time or faculty member.'
            : 'This timetable slot is unavailable. Please choose a different time or faculty member for your booking.')}
        </p>

        <div className="flex">
          <button
            onClick={availableSlots ? onCancel : (isFacultyBusy ? showAvailableSlots : onCancel)}
            disabled={loadingSlots}
            className="w-full px-4 py-3 rounded-[1.5rem] bg-surface-high hover:bg-surface-highest text-text-primary font-extrabold text-xs capitalize tracking-widest transition-all"
          >
            {availableSlots ? 'Choose a Listed Slot on the Calendar' : (loadingSlots ? 'Checking Availability…' : 'Choose Another Slot')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictResolutionDialog;

import React, { useState } from 'react';
import { X, AlertTriangle, Clock, User, BookOpen } from 'lucide-react';
import { bookingService } from '../../services/bookingService';
import { roomService } from '../../services/roomService';
import { formatTo24h, getHourFromTime } from '../../utils/timetableLogic';

function ConflictResolutionDialog({ conflict, onCancel, onResolve, loading }) {
  const [resolution, setResolution] = useState(null);

  const handleCancelClass = async () => {
    if (!conflict?.booking_id && !conflict?.room) return;
    setResolution('cancelling');
    try {
      if (conflict.booking_id) {
        await bookingService.cancelBooking(conflict.booking_id);
      } else {
        await roomService.createAvailabilityOverride({
          room_name: conflict.room,
          day: conflict.date || conflict.dateStr,
          hour: conflict.hour ?? getHourFromTime(conflict.time),
          is_available: true,
          reason: `Class ${conflict.subject || 'Scheduled class'} cancelled for room booking`
        });
      }
      onResolve('cancelled');
    } catch (err) {
      console.error('Failed to cancel class:', err);
      setResolution(null);
    }
  };

  const handleReschedule = () => {
    setResolution('reschedule');
    onResolve('reschedule');
  };

  const handleDismiss = () => {
    setResolution(null);
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-md"
        onClick={handleDismiss}
        aria-hidden="true"
        tabIndex="-1"
      />

      <div className="relative w-full max-w-md glass rounded-[2.5rem] p-6 sm:p-8 shadow-ambient border-none max-h-[90dvh] overflow-y-auto no-scrollbar">
        <button
          onClick={handleDismiss}
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
              Class Conflict
            </h2>
            <p className="text-text-secondary text-xs sm:text-sm font-bold opacity-40 capitalize tracking-widest mt-1">
              An existing class is scheduled for this time
            </p>
          </div>
        </div>

        <div className="bg-surface-mid rounded-2xl p-4 sm:p-5 mb-6 space-y-4">
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
        </div>

        <p className="text-text-secondary text-xs sm:text-sm font-bold mb-6 leading-relaxed">
          This class already occupies the selected time. Cancel this class to free the room, or reschedule your booking for another slot.
        </p>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleReschedule}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-[1.5rem] bg-surface-high hover:bg-surface-highest text-text-primary font-extrabold text-xs capitalize tracking-widest transition-all disabled:opacity-50"
          >
            Reschedule Booking
          </button>

          {(conflict?.booking_id || conflict?.room) && (
            <button
              onClick={handleCancelClass}
              disabled={loading || resolution === 'reschedule'}
              className="flex-1 px-4 py-3 rounded-[1.5rem] bg-red-500/15 hover:bg-red-500 text-red-500 hover:text-white font-extrabold text-xs capitalize tracking-widest transition-all disabled:opacity-50"
            >
              {resolution === 'cancelling' ? 'Cancelling...' : 'Cancel This Class'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConflictResolutionDialog;

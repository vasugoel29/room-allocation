import React, { useState, useContext, useEffect, useRef } from "react";
import { AppContext } from "../../context/AppContext";
import toast from "react-hot-toast";
import { X, AlertCircle, CheckCircle, GraduationCap } from "lucide-react";
import { bookingService } from "../../services/bookingService";
import { roomService } from "../../services/roomService";
import { useSearchDebounce } from "../../hooks/useSearchDebounce";
import { addMinutesToUtc, getIstDateKey, getIstHour, istDateTimeToUtc } from '../../utils/timezone';

import BookingTypeSelector from "../../features/booking/BookingTypeSelector";
import RescheduleDetails from "../../features/booking/RescheduleDetails";
import FacultySelector from "../../features/booking/FacultySelector";
import ConflictResolutionDialog from "./ConflictResolutionDialog";
import { P, can, canBook, booksDirect, isAdmin } from '../../utils/permissions';

function BookingModal({ slot, onClose, onSuccess }) {
  const {
    user,
    rooms,
    faculties,
    bookings,
    availability,
    timetableData,
    refreshAllData,
  } = useContext(AppContext);
  const modalRef = useRef(null);


  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    const handleEscape = (e) => {
      if (e.key === "Escape") onClose();
    };

    const handleFocusTrap = (e) => {
      if (!modalRef.current) return;
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleFocusTrap);

    // Initial focus
    const firstFocusable = modalRef.current?.querySelectorAll(
      "button, input, select, textarea",
    )[0];
    firstFocusable?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleFocusTrap);
    };
  }, [onClose]);
  const selectedRoom = slot?.room_id || "";
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState(null);

  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isDayOpen, setIsDayOpen] = useState(false);
  const [isHourOpen, setIsHourOpen] = useState(false);
  const [isRescheduleRoomOpen, setIsRescheduleRoomOpen] = useState(false);
  const [rescheduleSearchTerm, setRescheduleSearchTerm] = useState("");
  const rescheduleDebouncedTerm = useSearchDebounce(rescheduleSearchTerm);

  const [isFacultyOpen, setIsFacultyOpen] = useState(false);
  const [facultySearchTerm, setFacultySearchTerm] = useState("");
  const debouncedFacultyTerm = useSearchDebounce(facultySearchTerm);

  const [bookingType, setBookingType] = useState("EXTRA");
  const [rescheduleRoom, setRescheduleRoom] = useState("");
  const [rescheduleDay, setRescheduleDay] = useState(slot.day);
  const [rescheduleHour, setRescheduleHour] = useState(slot.hour);

  const selectedRoomData = rooms.find(
    (r) => String(r.id) === String(selectedRoom),
  );

  const getRoomBooking = (roomId) => {
    return bookings?.find((b) => {
      const bStatus = b.status || "ACTIVE";
      if (bStatus !== "ACTIVE" && bStatus !== "PENDING") return false;
      const bStart = new Date(b.start_time);
      const bHour = getIstHour(bStart);

      const bDateStr = getIstDateKey(bStart);
      const slotDateStr = getIstDateKey(slot.date);

      return (
        bDateStr === slotDateStr && bHour === slot.hour && b.room_id === roomId
      );
    });
  };

  const handleCancel = async () => {
    if (!canBook(user) && !can(user, P.FACULTY_PORTAL)) return;
    const booking = getRoomBooking(selectedRoom);
    if (!booking) return;

    setLoading(true);
    try {
      await bookingService.cancelBooking(booking.id);
      refreshAllData();
      onSuccess();
    } catch (err) {
      setError(err.message || "Cancellation failed");
    } finally {
      setLoading(false);
    }
  };

  // Needs approval and can't use restricted rooms unless the ACL grants cras.bookings.direct.
  const isStudent = !booksDirect(user);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canBook(user)) return;
    if (!selectedRoom) return setError("Please select a room");
    if (isStudent && selectedRoomData && (selectedRoomData.type === 'Committee Room' || selectedRoomData.type === 'Auditorium')) {
      return setError("Committee Rooms and Auditoriums can only be booked by Faculty or Admin.");
    }
    if (isStudent && !selectedFaculty)
      return setError("Please select a faculty for this class");
    if (bookingType === "RESCHEDULE" && !rescheduleRoom)
      return setError("Please specify the room being freed up");

    setLoading(true);
    setError("");

    const dateStr = getIstDateKey(slot.date);

    // Faculty availability check for students
    if (isStudent && selectedFaculty) {
      try {
        const check = await roomService.checkFacultyAvailability(selectedFaculty, dateStr, slot.hour);
        if (check.isOccupied) {
          setConflictData({ type: 'faculty_busy', date: dateStr, hour: slot.hour });
          setShowConflictDialog(true);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Faculty check failed:', err);
        // Continue if check fails (non-blocking)
      }
    }

    const start_time = istDateTimeToUtc(dateStr, slot.hour);
    const end_time = addMinutesToUtc(start_time, 60);

    const isTransfer = !!getRoomBooking(selectedRoom);

    const payload = isTransfer
      ? {
          booking_id: getRoomBooking(selectedRoom).id,
          target_faculty_id: isStudent ? selectedFaculty : null,
          new_purpose: purpose,
        }
      : {
          room_id: selectedRoom,
          start_time,
          end_time,
          faculty_id: isStudent ? selectedFaculty : null,
          purpose:
            bookingType === "RESCHEDULE" ? `Reschedule: ${purpose}` : purpose,
          reschedule_room_name:
            bookingType === "RESCHEDULE" ? rescheduleRoom : null,
          reschedule_day: bookingType === "RESCHEDULE" ? rescheduleDay : null,
          reschedule_hour: bookingType === "RESCHEDULE" ? rescheduleHour : null,
        };

    try {
      if (isTransfer) {
        await bookingService.requestTransfer(payload);
        toast.success("Transfer request sent successfully!");
      } else {
        await bookingService.createBooking(payload);
        if (isStudent && selectedFaculty) {
          const facultyName =
            faculties.find((f) => String(f.id) === String(selectedFaculty))
              ?.name || "Faculty";
          const targetDate = new Date(slot.date);
          const dateStr = targetDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          const roomName = selectedRoomData
            ? selectedRoomData.name
            : selectedRoom;
          toast.success(
            `Request sent to Prof. ${facultyName} for Room ${roomName} from ${slot.hour}:00 to ${slot.hour + 1}:00 on ${dateStr}.`,
          );
        } else {
          toast.success(
            `Success! Room ${selectedRoomData ? selectedRoomData.name : selectedRoom} has been booked for ${slot.day} at ${slot.hour}:00.`,
          );
        }
      }
      refreshAllData();
      onSuccess();
    } catch (err) {
      const errorMsg = err.message || "Booking failed";
      if (err.conflict && (err.conflict.type === 'faculty_busy' || errorMsg.includes('timetable'))) {
        setConflictData({
          ...err.conflict,
          date: dateStr,
          hour: slot.hour,
          booking_id: null
        });
        setShowConflictDialog(true);
        setError("");
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {showConflictDialog && conflictData && (
        <ConflictResolutionDialog
          conflict={conflictData}
          facultyId={selectedFaculty}
          facultyName={faculties.find((faculty) => String(faculty.id) === String(selectedFaculty))?.name}
          user={user}
          bookings={bookings}
          availability={availability}
          timetableData={timetableData}
          onCancel={() => {
            setShowConflictDialog(false);
            setConflictData(null);
          }}
        />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 overscroll-contain">
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-md touch-none"
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
        aria-hidden="true"
        tabIndex="-1"
      ></div>

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-xl mx-4 glass rounded-[2.5rem] p-6 sm:p-10 shadow-ambient border-none overflow-y-auto max-h-[90dvh] no-scrollbar overscroll-contain touch-pan-y"
      >
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 hover:bg-tonal-secondary/10 rounded-full text-text-secondary transition-all"
        >
          <X size={20} />
        </button>

        {(() => {
          const existingBooking = selectedRoom ? getRoomBooking(selectedRoom) : null;
          const canCancel = existingBooking && (
            String(existingBooking.created_by) === String(user?.id) ||
            isAdmin(user) ||
            (user?.faculty_id != null && String(existingBooking.faculty_id) === String(user.faculty_id))
          );
          const formattedDate = slot.date
            ? new Date(slot.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : "";
          
          let headerTitle = "Reserve Space";
          if (existingBooking) {
            headerTitle = canCancel ? "Booking Details" : "Request Transfer";
          }

          return (
            <h3
              id="modal-title"
              className="text-xl sm:text-2xl font-bold text-text-primary mb-2 flex items-center gap-3 flex-wrap font-display tracking-tight"
            >
              {headerTitle}
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-tonal-secondary/10 text-primary">
                {slot.day}{formattedDate ? `, ${formattedDate}` : ""} @ {slot.hour}:00
              </span>
            </h3>
          );
        })()}
        <div className="mb-6 sm:mb-8" />

        {error && (
          <div className="mb-6 sm:mb-8 p-4 rounded-2xl bg-red-500/10 text-red-500 text-xs sm:text-sm flex items-center gap-3 font-semibold font-display tracking-tight">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        {isStudent && selectedRoomData && (selectedRoomData.type === 'Committee Room' || selectedRoomData.type === 'Auditorium') && (
          <div className="mb-6 sm:mb-8 p-5 rounded-[1.75rem] bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500 text-xs sm:text-sm flex flex-col gap-2 font-display tracking-tight">
            <div className="flex items-center gap-3 font-bold text-sm">
              <AlertCircle size={20} />
              Booking Restricted
            </div>
            <p className="font-medium opacity-80 normal-case">
              {selectedRoomData.name} is a {selectedRoomData.type}. These spaces are reserved for academic/official activities and can only be booked by Faculty or Admin roles.
            </p>
          </div>
        )}

        {(() => {
          const existingBooking = selectedRoom ? getRoomBooking(selectedRoom) : null;
          const canCancel = existingBooking && (
            String(existingBooking.created_by) === String(user?.id) ||
            isAdmin(user) ||
            (user?.faculty_id != null && String(existingBooking.faculty_id) === String(user.faculty_id))
          );

          if (existingBooking && canCancel) {
            return (
              <div className="space-y-6 sm:space-y-8 font-body text-left">
                <div className="bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-3xl p-6 space-y-4 shadow-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                        Room
                      </span>
                      <span className="text-sm font-semibold text-text-primary">
                        {selectedRoomData?.name || selectedRoom}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                        Status
                      </span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg capitalize inline-block ${
                        existingBooking.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' :
                        existingBooking.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500' :
                        'bg-green-500/10 text-green-500'
                      }`}>
                        {existingBooking.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {existingBooking.class_name && (
                      <div>
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                          Class
                        </span>
                        <span className="text-sm font-semibold text-text-primary">
                          {existingBooking.class_name}
                        </span>
                      </div>
                    )}

                    {existingBooking.faculty_name && (
                      <div>
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                          Faculty
                        </span>
                        <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                          <GraduationCap size={14} className="text-primary shrink-0" />
                          {existingBooking.faculty_name}
                        </span>
                      </div>
                    )}

                    {existingBooking.purpose && (
                      <div className={existingBooking.faculty_name ? "col-span-2" : ""}>
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider block mb-1">
                          Purpose
                        </span>
                        <span className="text-sm font-medium text-text-primary font-body">
                          {existingBooking.purpose}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-4">
                  {canCancel ? (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={loading}
                      className="flex-1 bg-red-500 text-white shadow-lg shadow-red-500/20 hover:bg-red-600 disabled:opacity-50 py-3.5 sm:py-4 rounded-2xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] font-display flex items-center justify-center gap-2"
                    >
                      {loading ? "Processing..." : (
                        <>
                          <X size={18} />
                          Cancel Booking
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="flex-1 bg-tonal-secondary/5 text-text-secondary py-4 px-6 rounded-2xl text-center text-xs font-medium opacity-60 leading-relaxed border border-border/10">
                      Only the organizer or administration can revoke this booking.
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const transferBlocked = !!existingBooking && existingBooking.can_request_transfer === false;
          return (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              {existingBooking && (
                <div className="rounded-2xl border border-border/20 bg-surface-lowest px-4 py-3 text-sm" data-testid="booked-by">
                  <span className="block text-xs font-semibold tracking-wider text-text-secondary uppercase mb-0.5">Currently booked by</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {existingBooking.user_name || 'Another user'}
                    {existingBooking.class_name && existingBooking.class_name !== existingBooking.user_name ? ` · ${existingBooking.class_name}` : ''}
                    {existingBooking.faculty_name ? ` · Faculty: ${existingBooking.faculty_name}` : ''}
                  </span>
                  {transferBlocked && (
                    <span className="mt-1 block text-xs text-text-secondary">This booking can't be transferred (it is past, not active, or you can't request transfers).</span>
                  )}
                </div>
              )}
              <div className="space-y-3 sm:space-y-4">
                <div className={`grid grid-cols-1 ${isStudent ? 'sm:grid-cols-2' : ''} gap-3 sm:gap-4`}>
                  <BookingTypeSelector
                    bookingType={bookingType}
                    setBookingType={setBookingType}
                    isTypeOpen={isTypeOpen}
                    setIsTypeOpen={setIsTypeOpen}
                  />

                  {isStudent && (
                    <FacultySelector
                      faculties={faculties}
                      selectedFaculty={selectedFaculty}
                      setSelectedFaculty={setSelectedFaculty}
                      isFacultyOpen={isFacultyOpen}
                      setIsFacultyOpen={setIsFacultyOpen}
                      facultySearchTerm={facultySearchTerm}
                      setFacultySearchTerm={setFacultySearchTerm}
                      debouncedFacultyTerm={debouncedFacultyTerm}
                    />
                  )}
                </div>

                {bookingType === "RESCHEDULE" && (
                  <RescheduleDetails
                    rooms={rooms}
                    user={user}
                    rescheduleDay={rescheduleDay}
                    setRescheduleDay={setRescheduleDay}
                    isDayOpen={isDayOpen}
                    setIsDayOpen={setIsDayOpen}
                    rescheduleHour={rescheduleHour}
                    setRescheduleHour={setRescheduleHour}
                    isHourOpen={isHourOpen}
                    setIsHourOpen={setIsHourOpen}
                    rescheduleRoom={rescheduleRoom}
                    setRescheduleRoom={setRescheduleRoom}
                    rescheduleSearchTerm={rescheduleSearchTerm}
                    setRescheduleSearchTerm={setRescheduleSearchTerm}
                    isRescheduleRoomOpen={isRescheduleRoomOpen}
                    setIsRescheduleRoomOpen={setIsRescheduleRoomOpen}
                    rescheduleDebouncedTerm={rescheduleDebouncedTerm}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider ml-0.5 font-display">
                  Logistics & Context
                </label>
                <textarea
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Special Class, Meeting"
                  autoComplete="off"
                  rows={2}
                  className="w-full bg-surface-lowest dark:bg-surface-high border border-border-subtle rounded-xl px-4 py-2.5 text-xs text-text-primary font-medium focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all h-14 resize-none placeholder:text-text-secondary/40 shadow-sm font-body"
                />
              </div>

              <div className="flex gap-4 pt-2">
                {canBook(user) ? (
                  <button
                    type="submit"
                    disabled={loading || transferBlocked || (isStudent && selectedRoomData && (selectedRoomData.type === 'Committee Room' || selectedRoomData.type === 'Auditorium'))}
                    className={`flex-[2] flex items-center justify-center gap-2.5 ${existingBooking ? "bg-tertiary text-white shadow-tertiary" : "bg-primary text-white shadow-ambient"} disabled:opacity-50 py-3.5 sm:py-4 rounded-2xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] font-display`}
                  >
                    {loading ? "Processing..." : (
                      <>
                        {existingBooking ? "Request Transfer" : "Finalize Allocation"}
                        <CheckCircle size={18} />
                      </>
                    )}
                  </button>
                ) : (
                  <div className="flex-1 bg-tonal-secondary/10 text-text-secondary py-3.5 rounded-2xl text-center text-xs font-semibold uppercase tracking-wider opacity-60">
                    Read Only Registry
                  </div>
                )}
              </div>
            </form>
          );
        })()}
      </div>
    </div>
    </>
  );
}

export default BookingModal;

import React, { useState, useContext, useEffect, useRef } from "react";
import { AppContext } from "../../context/AppContext";
import toast from "react-hot-toast";
import { X, AlertCircle, CheckCircle } from "lucide-react";
import { bookingService } from "../../services/bookingService";
import { roomService } from "../../services/roomService";
import { useSearchDebounce } from "../../hooks/useSearchDebounce";

import RoomSelector from "../../features/booking/RoomSelector";
import BookingTypeSelector from "../../features/booking/BookingTypeSelector";
import RescheduleDetails from "../../features/booking/RescheduleDetails";
import FacultySelector from "../../features/booking/FacultySelector";

function BookingModal({ slot, onClose, onSuccess }) {
  const {
    user,
    rooms,
    faculties,
    bookings,
    availability,
    refreshAllData,
    timetableData,
  } = useContext(AppContext);
  const modalRef = useRef(null);

  useEffect(() => {
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
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleFocusTrap);
    };
  }, [onClose]);
  const [selectedRoom, setSelectedRoom] = useState(slot?.room_id || "");
  const [selectedFaculty, setSelectedFaculty] = useState("");
  const [purpose, setPurpose] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmedConflict, setConfirmedConflict] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedTerm = useSearchDebounce(searchTerm);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
      const bHour = bStart.getHours();

      const bDateStr = bStart.toDateString();
      const slotDateStr = new Date(slot.date).toDateString();

      return (
        bDateStr === slotDateStr && bHour === slot.hour && b.room_id === roomId
      );
    });
  };

  const handleCancel = async () => {
    if (user?.role === "VIEWER") return;
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

  const isStudent = user?.role !== "ADMIN" && user?.role !== "FACULTY";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (user?.role === "VIEWER") return;
    if (!selectedRoom) return setError("Please select a room");
    if (isStudent && !selectedFaculty)
      return setError("Please select a faculty for this class");
    if (bookingType === "RESCHEDULE" && !rescheduleRoom)
      return setError("Please specify the room being freed up");

    setLoading(true);
    setError("");

    const targetDate = new Date(slot.date);
    targetDate.setHours(slot.hour, 0, 0, 0);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Faculty availability check for students
    if (isStudent && selectedFaculty && !confirmedConflict) {
      try {
        console.log('[DEBUG] Student check faculty availability for:', selectedFaculty, dateStr, slot.hour);
        const check = await roomService.checkFacultyAvailability(selectedFaculty, dateStr, slot.hour);
        if (check.isOccupied) {
          const typeLabel = check.type === 'STATIC' ? 'Academic Class' : 'Existing Booking';
          const facultyName = faculties.find(f => String(f.id) === String(selectedFaculty))?.name;
          const confirmMsg = `Prof. ${facultyName} is busy with an ${typeLabel} (${check.content}) in this slot. \n\nDo you want to find another slot or CONTINUE ANYWAY?`;
          
          if (!window.confirm(confirmMsg)) {
            setLoading(false);
            return;
          }
          
          setConfirmedConflict(true);
        }
      } catch (err) {
        console.warn('Faculty check failed:', err);
        // Continue if check fails (non-blocking)
      }
    }

    const start_time = targetDate.toISOString();

    const endDate = new Date(targetDate);
    endDate.setHours(slot.hour + 1);
    const end_time = endDate.toISOString();

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
      setError(err.message || "Booking failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
        tabIndex="-1"
      ></div>

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-xl mx-4 glass rounded-[2.5rem] p-6 sm:p-10 shadow-ambient border-none overflow-y-auto max-h-[90dvh] no-scrollbar"
      >
        <button
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 hover:bg-tonal-secondary/10 rounded-full text-text-secondary transition-all"
        >
          <X size={20} />
        </button>

        <h3
          id="modal-title"
          className="text-2xl sm:text-3xl font-extrabold text-text-primary mb-2 flex items-center gap-4 flex-wrap font-display uppercase tracking-tight"
        >
          Reserve Space
          <span className="text-[10px] sm:text-[11px] font-extrabold px-3 py-1 rounded-lg bg-tonal-secondary/10 text-primary uppercase tracking-widest">
            {slot.day} @ {slot.hour}:00
          </span>
        </h3>
        <p className="text-text-secondary mb-6 sm:mb-10 text-xs sm:text-sm font-bold opacity-40 uppercase tracking-widest">
          Architectural precision in room scheduling.
        </p>

        {error && (
          <div className="mb-6 sm:mb-8 p-4 rounded-2xl bg-red-500/10 text-red-500 text-xs sm:text-sm flex items-center gap-3 font-extrabold font-display uppercase tracking-tight">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <RoomSelector
                rooms={rooms}
                availability={availability}
                slot={slot}
                user={user}
                selectedRoom={selectedRoom}
                setSelectedRoom={setSelectedRoom}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                debouncedTerm={debouncedTerm}
                isDropdownOpen={isDropdownOpen}
                setIsDropdownOpen={setIsDropdownOpen}
                getRoomBooking={getRoomBooking}
                timetableData={timetableData}
              />

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

          <div className="space-y-3">
            <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] ml-1 opacity-40 font-display">
              Logistics & Context
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Special Class, Club Meeting, Portfolio Review"
              autoComplete="off"
              className="w-full bg-tonal-secondary/10 rounded-[2rem] px-6 py-6 text-sm text-text-primary font-bold focus:outline-none transition-all h-28 resize-none placeholder:text-text-secondary/20 shadow-inner font-body"
            />
          </div>

          <div className="flex gap-4 pt-2">
            {user?.role !== "VIEWER" ? (
              !(
                selectedRoom &&
                getRoomBooking(selectedRoom) &&
                String(getRoomBooking(selectedRoom).created_by) ===
                  String(user?.id)
              ) && (
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-[2] flex items-center justify-center gap-3 ${selectedRoom && getRoomBooking(selectedRoom) ? "bg-tertiary text-white shadow-tertiary" : "bg-primary text-white shadow-ambient"} disabled:opacity-50 py-5 rounded-[2rem] text-sm font-extrabold transition-all active:scale-[0.98] font-display uppercase tracking-widest`}
                >
                  {loading ? (
                    "Processing..."
                  ) : (
                    <>
                      {selectedRoom && getRoomBooking(selectedRoom)
                        ? "Request Transfer"
                        : "Finalize Allocation"}
                      <CheckCircle size={20} />
                    </>
                  )}
                </button>
              )
            ) : (
              <div className="flex-1 bg-tonal-secondary/10 text-text-secondary py-5 rounded-2xl text-center text-[10px] font-extrabold uppercase tracking-widest opacity-40">
                Read Only Registry
              </div>
            )}
            {selectedRoom &&
              getRoomBooking(selectedRoom) &&
              String(getRoomBooking(selectedRoom).created_by) ===
                String(user?.id) && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-[2rem] text-[10px] font-extrabold uppercase tracking-widest transition-all flex items-center justify-center gap-3 font-display"
                >
                  <X size={20} />
                  Revoke
                </button>
              )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;

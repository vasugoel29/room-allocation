import React, { useState, useContext } from 'react';
import { AppContext } from '../../context/AppContext';
import toast from 'react-hot-toast';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { bookingService } from '../../services/bookingService';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';

import RoomSelector from '../../features/booking/RoomSelector';
import BookingTypeSelector from '../../features/booking/BookingTypeSelector';
import RescheduleDetails from '../../features/booking/RescheduleDetails';
import FacultySelector from '../../features/booking/FacultySelector';

function BookingModal({ slot, onClose, onSuccess }) {
  const { user, rooms, faculties, bookings, availability, fetchRooms, fetchBookings, fetchAvailability } = useContext(AppContext);
  const [selectedRoom, setSelectedRoom] = useState(slot?.room_id || '');
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedTerm = useSearchDebounce(searchTerm);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isDayOpen, setIsDayOpen] = useState(false);
  const [isHourOpen, setIsHourOpen] = useState(false);
  const [isRescheduleRoomOpen, setIsRescheduleRoomOpen] = useState(false);
  const [rescheduleSearchTerm, setRescheduleSearchTerm] = useState('');
  const rescheduleDebouncedTerm = useSearchDebounce(rescheduleSearchTerm);

  const [isFacultyOpen, setIsFacultyOpen] = useState(false);
  const [facultySearchTerm, setFacultySearchTerm] = useState('');
  const debouncedFacultyTerm = useSearchDebounce(facultySearchTerm);

  const [bookingType, setBookingType] = useState('EXTRA');
  const [rescheduleRoom, setRescheduleRoom] = useState('');
  const [rescheduleDay, setRescheduleDay] = useState(slot.day);
  const [rescheduleHour, setRescheduleHour] = useState(slot.hour);

  const selectedRoomData = rooms.find(r => String(r.id) === String(selectedRoom));

  const getRoomBooking = (roomId) => {
    return bookings?.find(b => {
      const bStatus = b.status || 'ACTIVE';
      if (bStatus !== 'ACTIVE' && bStatus !== 'PENDING') return false;
      const bStart = new Date(b.start_time);
      const bHour = bStart.getHours();
      
      const bDateStr = bStart.toDateString();
      const slotDateStr = new Date(slot.date).toDateString();
      
      return bDateStr === slotDateStr && bHour === slot.hour && b.room_id === roomId;
    });
  };

  const handleCancel = async () => {
    if (user?.role === 'VIEWER') return;
    const booking = getRoomBooking(selectedRoom);
    if (!booking) return;

    setLoading(true);
    try {
      await bookingService.cancelBooking(booking.id);
      fetchRooms();
      fetchBookings();
      fetchAvailability();
      onSuccess();
    } catch (err) {
      setError(err.message || 'Cancellation failed');
    } finally {
      setLoading(false);
    }
  };

  const isStudent = user?.role !== 'admin' && user?.role !== 'FACULTY';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (user?.role === 'VIEWER') return;
    if (!selectedRoom) return setError('Please select a room');
    if (isStudent && !selectedFaculty) return setError('Please select a faculty for this class');
    if (bookingType === 'RESCHEDULE' && !rescheduleRoom) return setError('Please specify the room being freed up');
    
    setLoading(true);
    setError('');

    const targetDate = new Date(slot.date);
    targetDate.setHours(slot.hour, 0, 0, 0);
    
    const start_time = targetDate.toISOString();
    
    const endDate = new Date(targetDate);
    endDate.setHours(slot.hour + 1);
    const end_time = endDate.toISOString();

    const isTransfer = !!getRoomBooking(selectedRoom);

    const payload = isTransfer 
      ? {
          booking_id: getRoomBooking(selectedRoom).id,
          target_faculty_id: isStudent ? selectedFaculty : null,
          new_purpose: purpose
        }
      : {
          room_id: selectedRoom,
          start_time,
          end_time,
          faculty_id: isStudent ? selectedFaculty : null,
          purpose: bookingType === 'RESCHEDULE' ? `Reschedule: ${purpose}` : purpose,
          reschedule_room_name: bookingType === 'RESCHEDULE' ? rescheduleRoom : null,
          reschedule_day: bookingType === 'RESCHEDULE' ? rescheduleDay : null,
          reschedule_hour: bookingType === 'RESCHEDULE' ? rescheduleHour : null
        };

    try {
      if (isTransfer) {
        await bookingService.requestTransfer(payload);
        toast.success('Transfer request sent successfully!');
      } else {
        await bookingService.createBooking(payload);
        if (isStudent && selectedFaculty) {
          const facultyName = faculties.find(f => String(f.id) === String(selectedFaculty))?.name || 'Faculty';
          const targetDate = new Date(slot.date);
          const dateStr = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const roomName = selectedRoomData ? selectedRoomData.name : selectedRoom;
          toast.success(`Request sent to Prof. ${facultyName} for Room ${roomName} from ${slot.hour}:00 to ${slot.hour + 1}:00 on ${dateStr}.`);
        } else {
          toast.success(`Success! Room ${selectedRoomData ? selectedRoomData.name : selectedRoom} has been booked for ${slot.day} at ${slot.hour}:00.`);
        }
      }
      fetchRooms();
      fetchBookings();
      fetchAvailability();
      onSuccess();
    } catch (err) {
      setError(err.message || 'Booking failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true"></div>
      
      <div className="relative w-full max-w-xl mx-4 glass dark:bg-slate-800 rounded-2xl sm:rounded-[2rem] p-4 sm:p-8 shadow-2xl border border-black/5 overflow-y-auto max-h-[90dvh] no-scrollbar">
        <button onClick={onClose} className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 hover:bg-black/5 rounded-full text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors">
          <X size={20} sm:size={24} />
        </button>

        <h3 className="text-xl sm:text-2xl font-bold text-text-primary mb-1 sm:mb-2 flex items-center gap-3 sm:gap-4 flex-wrap">
          Book Room
          <span className="text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-accent/10 text-accent capitalize">
            {slot.day} @ {slot.hour}:00
          </span>
        </h3>
        <p className="text-text-secondary mb-4 sm:mb-6 text-xs sm:text-sm">Secure your slot in one of the available rooms.</p>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-600 dark:text-red-400 text-xs sm:text-sm flex items-center gap-2 sm:gap-3 font-medium">
            <AlertCircle size={18} sm:size={20} />
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

            {bookingType === 'RESCHEDULE' && (
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

          <div className="space-y-2">
            <label className="text-xs font-bold text-text-primary uppercase tracking-wider">Purpose Details</label>
            <textarea 
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Special Class, Club Meeting"
              autoComplete="off"
              className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all h-20 resize-none placeholder:text-text-secondary/40 shadow-sm"
            />
          </div>

          <div className="flex gap-4 pt-2">
              {user?.role !== 'VIEWER' ? (
                <button 
                  type="submit" 
                  disabled={loading || (selectedRoom && getRoomBooking(selectedRoom) && String(getRoomBooking(selectedRoom).created_by) === String(user?.id))}
                  className={`flex-[2] flex items-center justify-center gap-3 ${selectedRoom && getRoomBooking(selectedRoom) ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-accent hover:bg-accent/80 shadow-accent/20'} disabled:opacity-50 text-white py-4 rounded-xl text-base font-bold transition-all shadow-lg active:scale-[0.98]`}
                >
                  {loading ? 'Processing...' : (
                    <>
                      <CheckCircle size={20} />
                      {selectedRoom && getRoomBooking(selectedRoom) ? 'Request Transfer' : 'Confirm Booking'}
                    </>
                  )}
                </button>
              ) : (
                <div className="flex-1 bg-bg-primary/50 text-text-secondary py-4 rounded-xl text-center text-sm font-bold border border-border">
                  View Only Mode
                </div>
              )}
              {selectedRoom && getRoomBooking(selectedRoom) && String(getRoomBooking(selectedRoom).created_by) === String(user?.id) && (
                  <button 
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 border-2 border-red-100 text-red-600 hover:bg-red-50 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-3"
                >
                  <X size={20} />
                  Cancel
                </button>
              )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default BookingModal;

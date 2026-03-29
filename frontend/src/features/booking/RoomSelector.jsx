import React from 'react';
import { Wind, Monitor } from 'lucide-react';
import toast from 'react-hot-toast';

function RoomSelector({ 
  rooms, 
  availability, 
  slot, 
  user,
  selectedRoom, 
  setSelectedRoom, 
  searchTerm, 
  setSearchTerm, 
  debouncedTerm,
  isDropdownOpen, 
  setIsDropdownOpen, 
  getRoomBooking 
}) {
  const selectedRoomData = rooms.find(r => String(r.id) === String(selectedRoom));

  return (
    <div className="space-y-1.5 sm:space-y-2">
      <label className="text-xs sm:text-sm font-bold text-text-primary">Select Room</label>
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            placeholder={selectedRoomData ? selectedRoomData.name : "Search for a room..."}
            value={searchTerm}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsDropdownOpen(true);
            }}
            autoComplete="off"
            aria-label="Search for a room"
            className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm text-text-primary font-bold focus:outline-none focus:bg-tonal-secondary/20 transition-all pr-12 shadow-inner placeholder:text-text-secondary/20 font-body"
          />
          <div 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-3 bg-neutral rounded-3xl shadow-ambient z-50 max-h-64 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
            {rooms
              .filter(room => {
                const av = availability?.find(a => a.room_id === room.id && a.day === slot.day && a.hour === slot.hour);
                const matchesSearch = !debouncedTerm || room.name.toLowerCase().includes(debouncedTerm.toLowerCase()) || room.building?.toLowerCase().includes(debouncedTerm.toLowerCase());
                return (av ? av.is_available : true) && matchesSearch;
              })
              .map(room => {
                const booking = getRoomBooking(room.id);
                const isSelected = String(selectedRoom) === String(room.id);
                
                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      if (booking && (booking.user_role === 'admin' || booking.user_role === 'FACULTY') && user?.role !== 'admin') {
                        toast.error("Cannot transfer from faculty or admin bookings");
                        return;
                      }
                      if (booking && String(booking.created_by) === String(user?.id)) {
                        toast.error("You cannot transfer from yourself");
                        return;
                      }
                      setSelectedRoom(room.id);
                      setIsDropdownOpen(false);
                      setSearchTerm('');
                    }}
                    className={`p-5 cursor-pointer transition-colors flex items-center justify-between hover:bg-white/5 ${isSelected ? 'bg-primary text-white font-extrabold shadow-ambient' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[70%]">
                      <span className={`font-extrabold text-lg tracking-tight uppercase font-display ${isSelected ? 'text-white' : 'text-text-primary'}`}>
                        {room.name}
                      </span>
                      <span className={`text-[10px] uppercase tracking-widest font-extrabold ${isSelected ? 'text-white/60' : 'text-text-secondary opacity-40'}`}>{room.building}</span>
                      {booking && (
                        <span className="text-[10px] text-tertiary font-extrabold uppercase tracking-widest bg-tonal-tertiary px-3 py-1 rounded-full mt-2 w-fit shadow-tertiary">
                          Occupied by {booking.user_name}
                        </span>
                      )}
                    </div>
                     <div className="flex gap-2 items-center opacity-80">
                       {room.has_ac && <Wind size={14} className={isSelected ? 'text-white' : 'text-primary'} />}
                       {room.has_projector && <Monitor size={14} className={isSelected ? 'text-white' : 'text-primary'} />}
                     </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RoomSelector;

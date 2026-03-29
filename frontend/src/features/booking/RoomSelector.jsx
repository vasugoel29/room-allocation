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
            className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all pr-10 shadow-sm hover:bg-bg-secondary/30"
          />
          <div 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
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
                    className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center justify-between hover:bg-accent/5 ${isSelected ? 'bg-accent/10 border-l-4 border-l-accent' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[70%]">
                      <span className="font-bold text-base text-text-primary truncate flex items-center gap-2">
                        {room.name}
                      </span>
                      <span className="text-xs text-text-secondary truncate font-medium">{room.building}</span>
                      {booking && (
                        <span className="text-sm text-red-600 font-black italic bg-red-50 px-2 py-0.5 rounded-md mt-1 w-fit">
                          Occupied by {booking.user_name}
                        </span>
                      )}
                    </div>
                     <div className="flex gap-2 items-center opacity-80">
                       {room.has_ac && <Wind size={14} className="text-accent" />}
                       {room.has_projector && <Monitor size={14} className="text-accent" />}
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

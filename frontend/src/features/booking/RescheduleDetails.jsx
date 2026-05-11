import React from 'react';
import { Wind, Monitor } from 'lucide-react';

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);

function RescheduleDetails({ 
  rooms,
  rescheduleDay, 
  setRescheduleDay, 
  isDayOpen, 
  setIsDayOpen, 
  rescheduleHour, 
  setRescheduleHour, 
  isHourOpen, 
  setIsHourOpen,
  rescheduleRoom,
  setRescheduleRoom,
  rescheduleSearchTerm,
  setRescheduleSearchTerm,
  isRescheduleRoomOpen,
  setIsRescheduleRoomOpen,
  rescheduleDebouncedTerm
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-top-2 duration-300 bg-tonal-secondary/5 p-6 rounded-[2rem] shadow-inner font-display">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
           <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Day to free up</label>
           <div className="relative">
             <div className="relative cursor-pointer" onClick={() => setIsDayOpen(!isDayOpen)}>
                <input
                  type="text"
                  readOnly
                  value={rescheduleDay}
                  className="w-full bg-tonal-secondary/10 rounded-xl px-4 py-3 text-[11px] font-extrabold text-text-primary focus:outline-none shadow-inner cursor-pointer pr-10 pointer-events-none uppercase tracking-widest"
                />
               <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50">
                 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isDayOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
               </div>
             </div>
                          {isDayOpen && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-surface-low dark:bg-surface-mid rounded-3xl shadow-ambient z-50 overflow-hidden max-h-56 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 border border-black/5 dark:border-white/5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
                    <div
                      key={d}
                      onClick={() => {
                        setRescheduleDay(d);
                        setIsDayOpen(false);
                      }}
                      className={`px-5 py-3.5 cursor-pointer transition-colors text-[11px] font-extrabold uppercase tracking-widest ${rescheduleDay === d ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'}`}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
        <div className="space-y-1.5">
           <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Slot to free up</label>
           <div className="relative">
             <div className="relative cursor-pointer" onClick={() => setIsHourOpen(!isHourOpen)}>
                <input
                  type="text"
                  readOnly
                  value={`${rescheduleHour}:00`}
                  className="w-full bg-tonal-secondary/10 rounded-xl px-4 py-3 text-[11px] font-extrabold text-text-primary focus:outline-none shadow-inner cursor-pointer pr-10 pointer-events-none uppercase tracking-widest"
                />
               <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50">
                 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isHourOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
               </div>
             </div>
                          {isHourOpen && (
                <div className="absolute top-full left-0 right-0 mt-3 bg-surface-low dark:bg-surface-mid rounded-3xl shadow-ambient z-50 max-h-56 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 border border-black/5 dark:border-white/5">
                  {HOURS.map(h => (
                    <div
                      key={h}
                      onClick={() => {
                        setRescheduleHour(h);
                        setIsHourOpen(false);
                      }}
                      className={`px-5 py-3.5 cursor-pointer transition-colors text-[11px] font-extrabold uppercase tracking-widest ${rescheduleHour === h ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'}`}
                    >
                      {h}:00
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-bold text-text-primary">Which room is being freed up?</label>
        <div className="relative">
          <div className="relative cursor-pointer">
            <input
              type="text"
              placeholder="Room and block registry search..."
              value={isRescheduleRoomOpen ? rescheduleSearchTerm : (rescheduleRoom || '')}
              onFocus={() => setIsRescheduleRoomOpen(true)}
              onChange={(e) => {
                setRescheduleSearchTerm(e.target.value);
                setRescheduleRoom(e.target.value);
                setIsRescheduleRoomOpen(true);
              }}
              autoComplete="off"
              aria-label="Search for room to free up"
              className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm text-text-primary font-bold focus:outline-none transition-all pr-12 shadow-inner placeholder:text-text-secondary/20 font-body"
            />
            <div 
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
              onClick={() => setIsRescheduleRoomOpen(!isRescheduleRoomOpen)}
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isRescheduleRoomOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          {isRescheduleRoomOpen && (
            <div className="absolute top-full left-0 right-0 mt-3 bg-surface-low dark:bg-surface-mid rounded-3xl shadow-ambient z-50 max-h-64 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 border border-black/5 dark:border-white/5">
              {rooms
                .filter(room => {
                  if (!rescheduleDebouncedTerm) return true;
                  return room.name.toLowerCase().includes(rescheduleDebouncedTerm.toLowerCase()) || 
                         room.building?.toLowerCase().includes(rescheduleDebouncedTerm.toLowerCase());
                })
                .map(room => (
                  <div
                    key={room.id}
                    onClick={() => {
                      setRescheduleRoom(room.name);
                      setRescheduleSearchTerm(room.name);
                      setIsRescheduleRoomOpen(false);
                    }}
                    className={`p-5 cursor-pointer transition-colors flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 ${rescheduleRoom === room.name ? 'bg-primary text-white shadow-ambient' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[70%]">
                      <span className={`font-extrabold text-lg tracking-tight uppercase font-display ${rescheduleRoom === room.name ? 'text-white' : 'text-text-primary'}`}>{room.name}</span>
                      <span className={`text-[10px] uppercase tracking-widest font-extrabold truncate ${rescheduleRoom === room.name ? 'text-white/60' : 'text-text-secondary opacity-40'}`}>{room.building}</span>
                    </div>
                    <div className="flex gap-2 items-center opacity-80">
                      {room.has_ac && <Wind size={14} className={rescheduleRoom === room.name ? 'text-white' : 'text-primary'} />}
                      {room.has_projector && <Monitor size={14} className={rescheduleRoom === room.name ? 'text-white' : 'text-primary'} />}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RescheduleDetails;

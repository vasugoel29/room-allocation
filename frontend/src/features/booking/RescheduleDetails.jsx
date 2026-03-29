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
    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 bg-bg-primary/50 p-4 rounded-xl border border-border shadow-inner">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
           <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Day to free up</label>
           <div className="relative">
             <div className="relative cursor-pointer" onClick={() => setIsDayOpen(!isDayOpen)}>
               <input
                 type="text"
                 readOnly
                 value={rescheduleDay}
                 className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-medium text-text-primary focus:outline-none focus:border-accent shadow-sm cursor-pointer pr-8 hover:bg-bg-primary/50 pointer-events-none"
               />
               <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50">
                 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isDayOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
               </div>
             </div>
             
             {isDayOpen && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
                 {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => (
                   <div
                     key={d}
                     onClick={() => {
                       setRescheduleDay(d);
                       setIsDayOpen(false);
                     }}
                     className={`px-3 py-2.5 cursor-pointer border-b border-border last:border-0 transition-colors text-sm ${rescheduleDay === d ? 'bg-accent/10 font-bold border-l-4 border-l-accent' : 'hover:bg-accent/5 font-medium'}`}
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
                 className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm font-medium text-text-primary focus:outline-none focus:border-accent shadow-sm cursor-pointer pr-8 hover:bg-bg-primary/50 pointer-events-none"
               />
               <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary/50">
                 <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isHourOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
               </div>
             </div>
             
             {isHourOpen && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
                 {HOURS.map(h => (
                   <div
                     key={h}
                     onClick={() => {
                       setRescheduleHour(h);
                       setIsHourOpen(false);
                     }}
                     className={`px-3 py-2.5 cursor-pointer border-b border-border last:border-0 transition-colors text-sm ${rescheduleHour === h ? 'bg-accent/10 font-bold border-l-4 border-l-accent' : 'hover:bg-accent/5 font-medium'}`}
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
              placeholder="Search for room to free up..."
              value={isRescheduleRoomOpen ? rescheduleSearchTerm : (rescheduleRoom || '')}
              onFocus={() => setIsRescheduleRoomOpen(true)}
              onChange={(e) => {
                setRescheduleSearchTerm(e.target.value);
                setRescheduleRoom(e.target.value);
                setIsRescheduleRoomOpen(true);
              }}
              autoComplete="off"
              aria-label="Search for room to free up"
              className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all pr-10 shadow-sm hover:bg-bg-primary/30"
            />
            <div 
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
              onClick={() => setIsRescheduleRoomOpen(!isRescheduleRoomOpen)}
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isRescheduleRoomOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>

          {isRescheduleRoomOpen && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
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
                    className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center justify-between hover:bg-accent/5 ${rescheduleRoom === room.name ? 'bg-accent/10 border-l-4 border-l-accent' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[70%]">
                      <span className="font-bold text-base text-text-primary truncate flex items-center gap-2">{room.name}</span>
                      <span className="text-xs text-text-secondary truncate font-medium">{room.building}</span>
                    </div>
                    <div className="flex gap-2 items-center opacity-80">
                      {room.has_ac && <Wind size={14} className="text-accent" />}
                      {room.has_projector && <Monitor size={14} className="text-accent" />}
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

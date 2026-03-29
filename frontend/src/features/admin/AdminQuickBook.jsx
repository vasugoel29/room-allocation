import { Zap, User as UserIcon, Search, ChevronDown, Check } from 'lucide-react';
import { useState, useMemo } from 'react';

function AdminQuickBook({ roomStatuses, users, quickBookForm, setQuickBookForm, submitting, onSubmit }) {
  const [userDropdownOpen, setUserDropdownOpen] = useState(null); // room_id
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(userSearch.toLowerCase()) || 
      u.email.toLowerCase().includes(userSearch.toLowerCase())
    );
  }, [users, userSearch]);

  const filteredRooms = roomStatuses.filter(r => 
    quickBookForm.roomFilter === 'all' || r.room_name === quickBookForm.roomFilter
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-bg-primary/50">
       {/* Discovery Header */}
       <div className="p-4 sm:p-6 border-b border-border bg-bg-secondary/20">
         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
           <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
             <div className="space-y-1">
               <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1">Date</label>
               <input 
                 type="date"
                 value={quickBookForm.date}
                 onChange={(e) => setQuickBookForm({...quickBookForm, date: e.target.value})}
                 className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent"
               />
             </div>
             <div className="space-y-1">
               <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1">Slot</label>
               <select 
                 value={quickBookForm.slot}
                 onChange={(e) => setQuickBookForm({...quickBookForm, slot: e.target.value})}
                 className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent appearance-none"
               >
                 {Array.from({length: 12}, (_, i) => i + 8).map(h => (
                   <option key={h} value={h}>{h.toString().padStart(2, '0')}:00 - {(h+1).toString().padStart(2, '0')}:00</option>
                 ))}
               </select>
             </div>
             <div className="space-y-1">
               <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1">Room Jump</label>
               <select 
                 value={quickBookForm.roomFilter}
                 onChange={(e) => setQuickBookForm({...quickBookForm, roomFilter: e.target.value})}
                 className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent appearance-none min-w-[120px]"
               >
                 <option value="all">All Rooms</option>
                 {roomStatuses.map(r => (
                   <option key={r.room_id} value={r.room_name}>{r.room_name}</option>
                 ))}
               </select>
             </div>
           </div>
           <div className="hidden sm:flex bg-accent/5 px-4 py-2 rounded-xl border border-accent/10 items-center gap-3">
             <Zap size={14} className="text-accent" />
             <span className="text-[10px] font-black text-accent uppercase tracking-widest italic">Rapid Discovery</span>
           </div>
         </div>
       </div>

       {/* Discovery Mobile Cards / Table */}
       <div className="flex-1 overflow-auto no-scrollbar">
          {/* Mobile View: Cards */}
          <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
            {filteredRooms.map(room => (
              <div key={room.room_id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="text-lg font-black text-text-primary tracking-tight">{room.room_name}</span>
                    <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-50">{room.building} • Floor {room.floor}</span>
                  </div>
                  {room.booking_id ? (
                    <span className="text-[10px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">Booked</span>
                  ) : (
                    <span className="text-[10px] font-black uppercase text-green-500 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">Available</span>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="relative">
                     <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] px-1 mb-1 block">Recipient</label>
                     <button 
                       onClick={() => setUserDropdownOpen(userDropdownOpen === room.room_id ? null : room.room_id)}
                       className="w-full flex items-center justify-between gap-3 bg-bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm font-bold"
                     >
                       <div className="flex items-center gap-2 truncate">
                          <UserIcon size={14} className="text-text-secondary opacity-40" />
                          <span className="truncate">
                            {users.find(u => u.id === quickBookForm[`target_${room.room_id}`])?.name || 'Select User...'}
                          </span>
                       </div>
                       <ChevronDown size={14} className={`text-text-secondary opacity-30 transition-transform ${userDropdownOpen === room.room_id ? 'rotate-180' : ''}`} />
                     </button>

                     {userDropdownOpen === room.room_id && (
                       <div className="absolute z-[100] mt-2 w-full bg-bg-primary border border-border rounded-2xl shadow-2xl overflow-hidden">
                          <div className="p-3 border-b border-border">
                            <input 
                              autoFocus
                              type="text"
                              placeholder="Search members..."
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                            />
                          </div>
                          <div className="max-h-[160px] overflow-auto">
                            {filteredUsers.map(u => (
                              <button 
                                key={u.id}
                                onClick={() => {
                                  setQuickBookForm({...quickBookForm, [`target_${room.room_id}`]: u.id});
                                  setUserDropdownOpen(null);
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-bg-secondary text-sm font-bold"
                              >
                                {u.name}
                              </button>
                            ))}
                          </div>
                       </div>
                     )}
                  </div>

                  <button 
                    disabled={submitting === room.room_name || room.booking_id}
                    onClick={() => onSubmit(room.room_name, quickBookForm[`target_${room.room_id}`])}
                    className={`w-full py-3.5 rounded-xl text-xs font-black transition-all ${
                      room.booking_id 
                        ? 'bg-text-secondary/10 text-text-secondary opacity-50 cursor-not-allowed' 
                        : 'bg-accent text-white shadow-lg shadow-accent/20'
                    }`}
                  >
                    {submitting === room.room_name ? 'Booking...' : (room.booking_id ? 'Already Booked' : 'Confirm Quick Allocation')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View: Table */}
          <table className="hidden sm:table w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-bg-secondary/90 backdrop-blur-md">
              <tr className="border-b border-border/50">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Room</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Status</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Member (Recipient)</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredRooms.map(room => (
                <tr key={room.room_id} className="hover:bg-bg-primary/30 transition-colors group">
                   <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-text-primary tracking-tight">{room.room_name}</span>
                        <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-50">{room.building} • Floor {room.floor}</span>
                      </div>
                   </td>
                   <td className="px-6 py-4">
                      {room.booking_id ? (
                        <div className="flex flex-col">
                           <span className="text-[10px] font-black uppercase text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 w-fit mb-1">Booked</span>
                           <span className="text-[10px] text-text-secondary font-medium italic truncate max-w-[120px]">"{room.purpose}" by {room.booked_by_name}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-black uppercase text-green-500 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 w-fit">Available</span>
                      )}
                   </td>
                   <td className="px-6 py-4">
                      <div className="relative">
                         <button 
                           onClick={() => setUserDropdownOpen(userDropdownOpen === room.room_id ? null : room.room_id)}
                           className="w-full max-w-[240px] flex items-center justify-between gap-3 bg-bg-primary border border-border rounded-xl px-4 py-2.5 text-sm font-bold hover:border-accent/50 transition-all"
                         >
                           <div className="flex items-center gap-2 truncate">
                              <UserIcon size={14} className="text-text-secondary opacity-40" />
                              <span className="truncate">
                                {users.find(u => u.id === quickBookForm[`target_${room.room_id}`])?.name || 'Select User...'}
                              </span>
                           </div>
                           <ChevronDown size={14} className={`text-text-secondary opacity-30 transition-transform ${userDropdownOpen === room.room_id ? 'rotate-180' : ''}`} />
                         </button>

                         {userDropdownOpen === room.room_id && (
                           <div className="fixed sm:absolute z-[100] mt-2 w-full max-w-[240px] bg-bg-primary border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="p-3 border-b border-border bg-bg-secondary/30">
                                <div className="relative">
                                  <input 
                                    autoFocus
                                    type="text"
                                    placeholder="Search members..."
                                    value={userSearch}
                                    onChange={(e) => setUserSearch(e.target.value)}
                                    className="w-full bg-bg-primary border border-border rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-accent pl-8"
                                  />
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/40" size={12} />
                                </div>
                              </div>
                              <div className="max-h-[200px] overflow-auto no-scrollbar">
                                {filteredUsers.length === 0 ? (
                                  <div className="p-4 text-center text-xs text-text-secondary font-bold uppercase tracking-widest">No users found</div>
                                ) : (
                                  filteredUsers.map(u => (
                                    <button 
                                      key={u.id}
                                      onClick={() => {
                                        setQuickBookForm({...quickBookForm, [`target_${room.room_id}`]: u.id});
                                        setUserDropdownOpen(null);
                                        setUserSearch('');
                                      }}
                                      className="w-full text-left px-4 py-3 hover:bg-bg-secondary transition-colors flex flex-col gap-0.5"
                                    >
                                      <span className="text-sm font-black text-text-primary">{u.name}</span>
                                      <span className="text-[10px] text-text-secondary opacity-60">{u.email}</span>
                                    </button>
                                  ))
                                )}
                              </div>
                           </div>
                         )}
                      </div>
                   </td>
                   <td className="px-6 py-4 text-right">
                      <button 
                        disabled={submitting === room.room_name || room.booking_id}
                        onClick={() => onSubmit(room.room_name, quickBookForm[`target_${room.room_id}`])}
                        className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg active:scale-95 disabled:opacity-30 disabled:active:scale-100 ${
                          room.booking_id 
                            ? 'bg-text-secondary/10 text-text-secondary shadow-none cursor-not-allowed' 
                            : 'bg-accent text-white shadow-accent/20 hover:opacity-90'
                        }`}
                      >
                        {submitting === room.room_name ? (
                           <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : room.booking_id ? (
                          'Booked'
                        ) : (
                          'Book Now'
                        )}
                      </button>
                   </td>
                </tr>
              ))}
            </tbody>
          </table>
       </div>
    </div>
  );
}

export default AdminQuickBook;

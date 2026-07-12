import React from 'react';
import { Wind, Monitor, Edit, Trash2, Home, Layers, Users } from 'lucide-react';
import CustomSelect from '../../components/ui/CustomSelect';

function AdminRooms({ 
  rooms, 
  searchTerm, 
  onEdit, 
  onDelete,
  selectedBuilding,
  setSelectedBuilding,
  selectedType,
  setSelectedType
}) {
  const filteredRooms = rooms.filter(room => {
    return room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          room.building?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          room.type?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const staticBlocks = ['4th Block', '5th Block', '6th Block', '8th Block', 'APJ Block', 'Smart Block', 'Others'];
  const buildings = ['all', ...staticBlocks];
  const types = ['all', 'Lecture Room', 'Lab', 'Auditorium', 'Committee Room'];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Internal filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border/20 bg-surface-low/40 font-display">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-wider">Building:</label>
          <CustomSelect 
            value={selectedBuilding} 
            onChange={setSelectedBuilding}
            options={buildings.map(b => ({ value: b, label: b === 'all' ? 'All Buildings' : b }))}
            buttonClassName="bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-[11px] font-bold text-text-primary flex items-center justify-between gap-2 focus:outline-none min-w-[120px] focus:border-primary/50"
            menuClassName="absolute top-full left-0 mt-1 bg-surface-low border border-border rounded-xl shadow-ambient z-[100] py-1 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 min-w-[140px]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-wider">Type:</label>
          <CustomSelect 
            value={selectedType} 
            onChange={setSelectedType}
            options={types.map(t => ({ value: t, label: t === 'all' ? 'All Types' : t }))}
            buttonClassName="bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-xl px-3 py-1.5 text-[11px] font-bold text-text-primary flex items-center justify-between gap-2 focus:outline-none min-w-[120px] focus:border-primary/50"
            menuClassName="absolute top-full left-0 mt-1 bg-surface-low border border-border rounded-xl shadow-ambient z-[100] py-1 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 min-w-[140px]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto no-scrollbar">
        {filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <span className="text-text-secondary capitalize font-black tracking-widest opacity-40">No rooms found</span>
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
              {filteredRooms.map(room => (
                <div key={room.id} className="bg-bg-primary p-5 rounded-2xl ring-1 ring-border/20 shadow-sm space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-lg font-black text-text-primary leading-tight font-display capitalize">{room.name}</span>
                      <span className="text-xs text-text-secondary font-bold capitalize tracking-wider mt-1">{room.building} &bull; Floor {room.floor}</span>
                      {room.description && (
                        <span className="text-[10px] text-text-secondary/70 font-medium font-body mt-1 leading-tight">{room.description}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-black capitalize whitespace-nowrap">
                        {room.type}
                      </span>
                      {room.student_access === false && (
                        <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20 text-[8px] font-black capitalize whitespace-nowrap">
                          Staff Only
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="flex items-center gap-1"><Users size={14} className="opacity-40" /> {room.capacity} seats</span>
                    <div className="flex gap-2 opacity-80">
                      {room.has_ac && <Wind size={14} className="text-primary" title="AC Available" />}
                      {room.has_projector && <Monitor size={14} className="text-primary" title="Projector Available" />}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(room)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-bg-secondary rounded-xl font-bold ring-1 ring-border/20 hover:ring-accent/40 text-xs capitalize tracking-wider transition-all"><Edit size={14} /> Edit</button>
                    <button onClick={() => onDelete(room.id)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-bg-secondary text-red-500 rounded-xl font-bold ring-1 ring-border/20 hover:ring-red-500/40 text-xs capitalize tracking-wider transition-all"><Trash2 size={14} /> Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View */}
            <table className="hidden sm:table w-full text-left border-collapse font-body">
              <thead>
                <tr className="border-b border-border/25 bg-surface-low/60 backdrop-blur-sm">
                  <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Room Name</th>
                  <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Location</th>
                  <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Capacity</th>
                  <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Type</th>
                  <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Amenities</th>
                  <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filteredRooms.map((room, idx) => (
                  <tr key={room.id} className={`hover:bg-surface-mid/60 transition-colors group ${idx % 2 === 0 ? 'row-alt' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-text-primary font-display capitalize">{room.name}</span>
                        {room.description && (
                          <span className="text-[10px] text-text-secondary/70 font-medium font-body leading-tight mt-0.5 max-w-[180px] truncate" title={room.description}>
                            {room.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-text-secondary capitalize">
                      {room.building} &bull; Floor {room.floor}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-text-primary">
                      {room.capacity} seats
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-black capitalize whitespace-nowrap">
                          {room.type}
                        </span>
                        {room.student_access === false && (
                          <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20 text-[8px] font-black capitalize whitespace-nowrap">
                            Staff Only
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-3 opacity-80">
                        {room.has_ac ? <Wind size={16} className="text-primary" title="AC" /> : <Wind size={16} className="text-text-secondary opacity-25" title="No AC" />}
                        {room.has_projector ? <Monitor size={16} className="text-primary" title="Projector" /> : <Monitor size={16} className="text-text-secondary opacity-25" title="No Projector" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => onEdit(room)}
                          className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-accent hover:border-accent/50 transition-all shadow-sm"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => onDelete(room.id)}
                          className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-red-500 hover:border-red-500/50 transition-all shadow-sm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminRooms;

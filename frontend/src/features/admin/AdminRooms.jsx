import React, { useState } from 'react';
import { Wind, Monitor, Edit, Trash2, Home, Layers, Users } from 'lucide-react';

function AdminRooms({ rooms, searchTerm, onEdit, onDelete }) {
  const [selectedBuilding, setSelectedBuilding] = useState('all');
  const [selectedType, setSelectedType] = useState('all');

  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          room.building?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          room.type?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBuilding = selectedBuilding === 'all' || room.building === selectedBuilding;
    const matchesType = selectedType === 'all' || room.type === selectedType;

    return matchesSearch && matchesBuilding && matchesType;
  });

  // Extract unique building names for filter
  const buildings = ['all', ...new Set(rooms.map(r => r.building).filter(Boolean))];
  const types = ['all', 'Lecture Room', 'Lab', 'Auditorium', 'Committee Room'];

  if (filteredRooms.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <span className="text-text-secondary capitalize font-black tracking-widest opacity-40">No rooms found</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Internal filters */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border/10 font-display">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-wider">Building:</label>
          <select 
            value={selectedBuilding} 
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="bg-tonal-secondary/10 border border-text-secondary/10 rounded-xl px-3 py-1.5 text-[11px] font-bold text-text-primary focus:outline-none"
          >
            {buildings.map(b => (
              <option key={b} value={b} className="bg-surface-mid text-text-primary">{b === 'all' ? 'All Buildings' : b}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-wider">Type:</label>
          <select 
            value={selectedType} 
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-tonal-secondary/10 border border-text-secondary/10 rounded-xl px-3 py-1.5 text-[11px] font-bold text-text-primary focus:outline-none"
          >
            {types.map(t => (
              <option key={t} value={t} className="bg-surface-mid text-text-primary">{t === 'all' ? 'All Types' : t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto no-scrollbar">
        {/* Mobile View */}
        <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
          {filteredRooms.map(room => (
            <div key={room.id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <span className="text-lg font-black text-text-primary leading-tight font-display capitalize">{room.name}</span>
                  <span className="text-xs text-text-secondary font-bold capitalize tracking-wider mt-1">{room.building} &bull; Floor {room.floor}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-black capitalize">
                  {room.type}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-text-secondary">
                <span className="flex items-center gap-1"><Users size={14} className="opacity-40" /> {room.capacity} seats</span>
                <div className="flex gap-2 opacity-80">
                  {room.has_ac && <Wind size={14} className="text-primary" title="AC Available" />}
                  {room.has_projector && <Monitor size={14} className="text-primary" title="Projector Available" />}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onEdit(room)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-bg-secondary rounded-xl font-bold border border-border text-xs capitalize tracking-wider"><Edit size={14} /> Edit</button>
                <button onClick={() => onDelete(room.id)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-bg-secondary text-red-500 rounded-xl font-bold border border-border text-xs capitalize tracking-wider"><Trash2 size={14} /> Delete</button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop View */}
        <table className="hidden sm:table w-full text-left border-collapse font-body">
          <thead>
            <tr className="border-b border-border/50 bg-bg-secondary/50">
              <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Room Name</th>
              <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Location</th>
              <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Capacity</th>
              <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Type</th>
              <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Amenities</th>
              <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filteredRooms.map(room => (
              <tr key={room.id} className="hover:bg-bg-primary/30 transition-colors group">
                <td className="px-6 py-4">
                  <span className="text-sm font-black text-text-primary font-display capitalize">{room.name}</span>
                </td>
                <td className="px-6 py-4 text-xs font-bold text-text-secondary capitalize">
                  {room.building} &bull; Floor {room.floor}
                </td>
                <td className="px-6 py-4 text-xs font-bold text-text-primary">
                  {room.capacity} seats
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-[9px] font-black capitalize">
                    {room.type}
                  </span>
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
      </div>
    </div>
  );
}

export default AdminRooms;

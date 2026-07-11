import { X, Home } from 'lucide-react';
import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

function AdminRoomModal({ isOpen, onClose, editingRoom, fetchRooms }) {
  const [roomForm, setRoomForm] = useState({ 
    name: '', building: '', floor: 0, capacity: 50, 
    type: 'Lecture Room', has_ac: false, has_projector: false
  });

  useEffect(() => {
    if (editingRoom) {
      setRoomForm({ 
        name: editingRoom.name, 
        building: editingRoom.building || '', 
        floor: editingRoom.floor || 0, 
        capacity: editingRoom.capacity || 50, 
        type: editingRoom.type || 'Lecture Room',
        has_ac: !!editingRoom.has_ac,
        has_projector: !!editingRoom.has_projector
      });
    } else {
      setRoomForm({ 
        name: '', building: '', floor: 0, capacity: 50, 
        type: 'Lecture Room', has_ac: false, has_projector: false
      });
    }
  }, [editingRoom, isOpen]);

  const handleRoomSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        await adminService.updateRoom(editingRoom.id, roomForm);
      } else {
        await adminService.createRoom(roomForm);
      }
      
      toast.success(editingRoom ? 'Room updated successfully' : 'Room created successfully');
      onClose();
      fetchRooms();
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    }
  };

  if (!isOpen) return null;

  const roomTypes = ['Lecture Room', 'Lab', 'Auditorium', 'Committee Room'];

  return (
    <div className="fixed inset-0 bg-neutral/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-neutral/90 w-full max-w-md rounded-[3rem] shadow-ambient overflow-hidden animate-in fade-in zoom-in duration-300 font-display border border-white/5">
        <div className="p-8 flex justify-between items-center bg-tonal-secondary/10">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl shadow-ambient">
              <Home className="text-primary" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-text-primary uppercase tracking-tight leading-none">
                {editingRoom ? 'Edit Room' : 'New Room'}
              </h2>
              <p className="text-[10px] font-extrabold text-text-secondary uppercase tracking-widest mt-1 opacity-40">
                Resource Configuration
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-tonal-secondary/10 rounded-full transition-all text-text-secondary">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleRoomSubmit} className="p-8 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Room Name/Number</label>
            <input 
              required
              type="text"
              placeholder="e.g. 5013, Audi-2"
              value={roomForm.name}
              onChange={(e) => setRoomForm({...roomForm, name: e.target.value})}
              className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Building/Block</label>
              <input 
                required
                type="text"
                placeholder="e.g. Block VI"
                value={roomForm.building}
                onChange={(e) => setRoomForm({...roomForm, building: e.target.value})}
                className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Floor Level</label>
              <input 
                required
                type="number"
                min="0"
                max="10"
                placeholder="0 for G, 1 for 1st"
                value={roomForm.floor}
                onChange={(e) => setRoomForm({...roomForm, floor: parseInt(e.target.value) || 0})}
                className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Capacity</label>
              <input 
                required
                type="number"
                min="1"
                placeholder="e.g. 60"
                value={roomForm.capacity}
                onChange={(e) => setRoomForm({...roomForm, capacity: parseInt(e.target.value) || 0})}
                className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Room Type</label>
              <select 
                value={roomForm.type}
                onChange={(e) => setRoomForm({...roomForm, type: e.target.value})}
                className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
              >
                {roomTypes.map(t => (
                  <option key={t} value={t} className="bg-surface-mid text-text-primary">{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-6 py-2 px-1">
            <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-text-primary">
              <input 
                type="checkbox"
                checked={roomForm.has_ac}
                onChange={(e) => setRoomForm({...roomForm, has_ac: e.target.checked})}
                className="rounded text-primary focus:ring-primary w-4 h-4 bg-tonal-secondary/20 border-text-secondary/10"
              />
              Air Conditioned (AC)
            </label>
            <label className="flex items-center gap-3 cursor-pointer text-xs font-bold text-text-primary">
              <input 
                type="checkbox"
                checked={roomForm.has_projector}
                onChange={(e) => setRoomForm({...roomForm, has_projector: e.target.checked})}
                className="rounded text-primary focus:ring-primary w-4 h-4 bg-tonal-secondary/20 border-text-secondary/10"
              />
              Has Projector
            </label>
          </div>

          <button 
            type="submit" 
            className="w-full py-4.5 bg-primary text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-ambient active:scale-[0.98] transition-all"
          >
            {editingRoom ? 'Save Settings' : 'Create Room'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminRoomModal;

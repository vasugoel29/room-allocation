import { useContext } from 'react';
import { Wind, Search, Layers, Zap } from 'lucide-react';
import { AppContext } from '../../context/AppContext';
import { booksDirect } from '../../utils/permissions';

function RoomFilter() {
  const { user, filters, setFilters } = useContext(AppContext);
  const isStudent = !booksDirect(user);

  const updateFilter = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div data-tour="room-filter" className="space-y-3">
      {/* Room Search */}
      <div className="space-y-2">
        <div className="relative group">
          <input 
            type="text"
            placeholder="Search room name..."
            value={filters.searchTerm || ''}
            onChange={(e) => updateFilter('searchTerm', e.target.value)}
            className="w-full bg-surface-low border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-primary/50 transition-all pl-9 font-body font-semibold text-text-primary placeholder:text-text-secondary/40"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/40" size={15} />
        </div>

        {/* AC & Projector filter moved to top */}
        <button
          onClick={() => updateFilter('smartRoom', !filters.smartRoom)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all font-display border text-xs ${filters.smartRoom ? 'bg-tertiary/15 border-tertiary text-tertiary font-bold shadow-sm' : 'bg-surface-low border-border-subtle text-text-secondary hover:text-text-primary'}`}
        >
          <div className="flex items-center gap-2">
            <Wind size={15} className={filters.smartRoom ? 'text-tertiary' : 'text-text-secondary/50'} />
            <span className="font-semibold text-xs">AC & Projector Only</span>
          </div>
          <div className={`w-7 h-3.5 rounded-full transition-all relative ${filters.smartRoom ? 'bg-tertiary' : 'bg-surface-highest/40'}`}>
            <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${filters.smartRoom ? 'left-3.5' : 'left-0.5'}`} />
          </div>
        </button>
      </div>

      <div className="space-y-2.5">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1 opacity-60 font-display">Campus Block</label>
          <div className="grid grid-cols-3 gap-1 bg-surface-lowest/70 border border-border-subtle p-1 rounded-xl">
            {['all', '4th Block', '5th Block', '6th Block', '8th Block', 'APJ Block', 'Smart Block', ...(!isStudent ? ['Others'] : [])].map((b) => (
              <button
                key={b}
                onClick={() => {
                  if (b === 'all') {
                    updateFilter('building', ['all']);
                  } else {
                    const current = filters.building || [];
                    const isAll = current.includes('all');
                    let next;
                    if (isAll) {
                      next = [b];
                    } else {
                      next = current.includes(b) 
                       ? current.filter(x => x !== b)
                       : [...current, b];
                    }
                    updateFilter('building', next.length === 0 ? ['all'] : next);
                  }
                }}
                className={`py-1.5 rounded-lg text-[10px] font-bold transition-all font-display ${filters.building?.includes(b) ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {b === 'all' ? 'All' : b.replace(' Block', '')}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1 opacity-60 font-display">Floor Level</label>
          <div className="flex bg-surface-lowest/70 border border-border-subtle p-1 rounded-xl gap-0.5">
            {['all', 'G', '1', '2', '3'].map((f) => (
              <button
                key={f}
                onClick={() => updateFilter('floor', f)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all font-display ${filters.floor === f ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1 opacity-60 font-display">Room Type</label>
          <div className="grid grid-cols-3 gap-1 bg-surface-lowest/70 border border-border-subtle p-1 rounded-xl">
            {[
              { id: 'all', label: 'All' },
              { id: 'Lecture Room', label: 'Lectures' },
              { id: 'Lab', label: 'Labs' },
              ...(isStudent ? [] : [
                { id: 'Auditorium', label: 'Auditoriums' },
                { id: 'Committee Room', label: 'Committee Rooms' }
              ])
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => updateFilter('roomType', t.id)}
                className={`py-1.5 rounded-lg text-[10px] font-bold transition-all font-display truncate px-1 ${filters.roomType === t.id ? 'bg-primary text-white shadow-sm' : (!filters.roomType && t.id === 'all') ? 'bg-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomFilter;

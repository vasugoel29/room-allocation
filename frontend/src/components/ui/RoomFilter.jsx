import { useContext } from 'react';
import { Wind, Search, Layers, Zap } from 'lucide-react';
import { AppContext } from '../../context/AppContext';

function RoomFilter() {
  const { filters, setFilters } = useContext(AppContext);

  const updateFilter = (name, value) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-6">
      {/* Room Search */}
      <div className="space-y-2">

        <div className="relative group">
          <input 
            type="text"
            placeholder="Search room name..."
            value={filters.searchTerm || ''}
            onChange={(e) => updateFilter('searchTerm', e.target.value)}
            className="w-full bg-tonal-secondary/10 border border-text-secondary/10 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:bg-tonal-secondary/20 focus:border-text-secondary/20 transition-all pl-11 font-body font-bold text-text-primary placeholder:text-text-secondary/30"
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" size={18} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-50 font-display">Campus Block</label>
          <div className="grid grid-cols-3 gap-1.5 bg-tonal-secondary/10 border border-text-secondary/10 p-1.5 rounded-xl">
            {['all', '4th Block', '5th Block', '6th Block', '8th Block'].map((b) => (
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
                className={`py-2 rounded-lg text-[10px] font-extrabold uppercase transition-all font-display ${filters.building?.includes(b) ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {b === 'all' ? 'All' : b.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-50 font-display">Floor Level</label>
          <div className="flex bg-tonal-secondary/10 border border-text-secondary/10 p-1 rounded-xl">
            {['all', 'G', '1', '2', '3'].map((f) => (
              <button
                key={f}
                onClick={() => updateFilter('floor', f)}
                className={`flex-1 py-2 rounded-lg text-[10px] font-extrabold uppercase transition-all font-display ${filters.floor === f ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => updateFilter('smartRoom', !filters.smartRoom)}
            className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all font-display border ${filters.smartRoom ? 'bg-tonal-tertiary border-tertiary/20 text-tertiary shadow-tertiary' : 'bg-tonal-secondary/10 border-text-secondary/10 text-text-secondary hover:text-text-primary'}`}
          >
            <div className="flex items-center gap-3">
              <Zap size={18} className={filters.smartRoom ? 'text-tertiary shadow-tertiary' : 'text-text-secondary/40'} />
              <span className="text-[10px] font-extrabold uppercase tracking-widest">Smart Spaces Only</span>
            </div>
            <div className={`w-8 h-4 rounded-full transition-all relative ${filters.smartRoom ? 'bg-tertiary' : 'bg-text-secondary/20'}`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${filters.smartRoom ? 'left-4.5' : 'left-0.5'}`} />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoomFilter;

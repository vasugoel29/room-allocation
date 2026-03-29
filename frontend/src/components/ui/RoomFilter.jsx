import { useContext } from 'react';
import { Wind, Search, Layers } from 'lucide-react';
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
        <label className="text-xs font-bold text-text-primary flex items-center gap-2">
          <Search size={14} className="text-accent" />
          Room Search
        </label>
        <div className="relative group">
          <input 
            type="text"
            placeholder="Ex: 5101..."
            value={filters.searchTerm || ''}
            onChange={(e) => updateFilter('searchTerm', e.target.value)}
            className="w-full bg-bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-all pl-10 group-hover:bg-bg-primary/50"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary/30" size={16} />
        </div>
      </div>

      {/* Floor Selection */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-text-primary flex items-center gap-2">
          <Layers size={14} className="text-accent" />
          Floor Level
        </label>
        <div className="grid grid-cols-5 gap-1.5 bg-bg-secondary/50 p-1 rounded-xl border border-border">
          {['all', '0', '1', '2', '3'].map(f => (
            <button
              key={f}
              onClick={() => updateFilter('floor', f)}
              className={`py-2 rounded-lg text-[10px] font-black transition-all ${filters.floor === f ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary hover:bg-bg-primary/50'}`}
            >
              {f === 'all' ? 'ALL' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Smart Room Toggle */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-text-primary flex items-center gap-2">
          <Wind size={14} className="text-accent" />
          Environment
        </label>
        <button 
          onClick={() => updateFilter('smartRoom', !filters.smartRoom)}
          className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${filters.smartRoom ? 'bg-accent shadow-lg shadow-accent/20 border-accent text-white' : 'bg-bg-secondary/30 border-border text-text-secondary hover:border-text-secondary/30'}`}
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl transition-colors ${filters.smartRoom ? 'bg-white/20' : 'bg-bg-secondary'}`}>
              <Wind size={18} className={filters.smartRoom ? 'text-white' : 'text-text-secondary'} />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-sm font-black">Smart Room</span>
              {!filters.smartRoom && <span className="text-[10px] opacity-50 font-bold">AC + Projector</span>}
            </div>
          </div>
          <div className={`w-10 h-5 rounded-full relative transition-colors ${filters.smartRoom ? 'bg-white/30' : 'bg-black/10'}`}>
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${filters.smartRoom ? 'left-6' : 'left-1'}`}></div>
          </div>
        </button>
      </div>
    </div>
  );
}

export default RoomFilter;

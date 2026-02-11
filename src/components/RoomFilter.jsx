import React from 'react';
import { Filter, Users, Wind, Monitor } from 'lucide-react';

function RoomFilter({ filters, setFilters }) {
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Filter size={14} />
          Filters
        </h3>
        
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Users size={16} className="text-slate-500" />
              Min Capacity
            </label>
            <input 
              type="number" 
              name="capacity"
              value={filters.capacity}
              onChange={handleChange}
              placeholder="e.g. 30"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
          </div>

          <div className="space-y-3">
             <label className="flex items-center gap-3 cursor-pointer group">
               <div className="relative">
                 <input 
                   type="checkbox" 
                   name="ac"
                   checked={filters.ac}
                   onChange={handleChange}
                   className="sr-only peer"
                 />
                 <div className="w-10 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
                 <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform"></div>
               </div>
               <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                 <Wind size={16} className="text-slate-500" />
                 AC Required
               </span>
             </label>

             <label className="flex items-center gap-3 cursor-pointer group">
               <div className="relative">
                 <input 
                   type="checkbox" 
                   name="projector"
                   checked={filters.projector}
                   onChange={handleChange}
                   className="sr-only peer"
                 />
                 <div className="w-10 h-5 bg-white/10 rounded-full peer peer-checked:bg-indigo-600 transition-colors"></div>
                 <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full peer-checked:translate-x-5 transition-transform"></div>
               </div>
               <span className="text-sm text-slate-300 group-hover:text-white transition-colors flex items-center gap-2">
                 <Monitor size={16} className="text-slate-500" />
                 Projector
               </span>
             </label>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomFilter;

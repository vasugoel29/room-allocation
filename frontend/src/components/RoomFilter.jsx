import { Filter, Wind, Monitor } from 'lucide-react';

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
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-widest mb-6 flex items-center gap-3">
          <Filter size={16} />
          Filters
        </h3>
        
          <div className="space-y-3">
             <label className="flex items-center gap-4 cursor-pointer group" key="ac">
               <div className="relative">
                 <input 
                   type="checkbox" 
                   name="ac"
                   checked={filters.ac}
                   onChange={handleChange}
                   className="sr-only peer"
                 />
                 <div className="w-12 h-6 bg-border rounded-full peer peer-checked:bg-accent transition-colors"></div>
                 <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-transform shadow-sm"></div>
               </div>
               <span className="text-base text-text-secondary group-hover:text-text-primary transition-colors flex items-center gap-2 font-medium">
                 <Wind size={16} className="text-text-secondary/50" />
                 AC Required
               </span>
             </label>

             <label className="flex items-center gap-4 cursor-pointer group" key="projector">
               <div className="relative">
                 <input 
                   type="checkbox" 
                   name="projector"
                   checked={filters.projector}
                   onChange={handleChange}
                   className="sr-only peer"
                 />
                 <div className="w-12 h-6 bg-border rounded-full peer peer-checked:bg-accent transition-colors"></div>
                 <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full peer-checked:translate-x-6 transition-transform shadow-sm"></div>
               </div>
               <span className="text-base text-text-secondary group-hover:text-text-primary transition-colors flex items-center gap-2 font-medium">
                 <Monitor size={16} className="text-text-secondary/50" />
                 Projector
               </span>
          </label>
       </div>
      </div>
    </div>
  );
}

export default RoomFilter;

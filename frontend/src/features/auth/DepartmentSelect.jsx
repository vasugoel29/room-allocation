import React from 'react';
import { Building2 } from 'lucide-react';

function DepartmentSelect({ 
  departments, 
  departmentName, 
  setDepartmentName, 
  isDeptOpen, 
  setIsDeptOpen 
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-text-secondary uppercase tracking-[0.1em] px-1">Department</label>
      <div className="relative">
        <div className="relative">
          <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/40" />
          <input
            type="text"
            className="w-full bg-bg-primary border border-border rounded-xl pl-11 pr-10 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-accent transition-all placeholder:text-text-secondary/30 shadow-sm hover:bg-bg-secondary/30"
            placeholder="Select or type department"
            value={departmentName}
            onFocus={() => setIsDeptOpen(true)}
            onChange={(e) => {
              setDepartmentName(e.target.value);
              setIsDeptOpen(true);
            }}
            required
          />
          <div 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
            onClick={() => setIsDeptOpen(!isDeptOpen)}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isDeptOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isDeptOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
            {departments
              .filter(d => !departmentName || d.name.toLowerCase().includes(departmentName.toLowerCase()))
              .map((d, i) => (
                <div
                  key={d.id || i}
                  onClick={() => {
                    setDepartmentName(d.name);
                    setIsDeptOpen(false);
                  }}
                  className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center gap-2 hover:bg-accent/5 ${departmentName === d.name ? 'bg-accent/10 font-bold border-l-4 border-l-accent' : 'font-medium'}`}
                >
                  <span className="text-sm">{d.name}</span>
                </div>
              ))}
            {departments.filter(d => d.name.toLowerCase().includes(departmentName.toLowerCase())).length === 0 && departmentName && (
              <div className="p-3 text-xs text-text-secondary font-medium">Add new: <span className="text-accent">"{departmentName}"</span></div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DepartmentSelect;

import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * Reusable, glass-morphic search input for page-level contextual search
 */
function PageSearch({ value, onChange, placeholder = "Search...", className = "" }) {
  return (
    <div className={`relative group w-full sm:w-64 max-w-full ${className}`}>
      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
        <Search size={14} className="text-text-secondary group-focus-within:text-accent transition-colors" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-primary/50 border border-border/50 rounded-xl pl-9 pr-9 py-2 text-xs font-bold text-text-primary focus:outline-none focus:border-accent/40 focus:ring-4 focus:ring-accent/5 transition-all placeholder:text-text-secondary/50 placeholder:font-black placeholder:uppercase placeholder:tracking-widest"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-3 flex items-center text-text-secondary/50 hover:text-text-primary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default PageSearch;

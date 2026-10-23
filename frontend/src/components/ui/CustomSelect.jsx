import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { useSearchDebounce } from '../../hooks/useSearchDebounce';

const CustomSelect = ({ 
  value, 
  onChange, 
  options = [], 
  placeholder = "Select option", 
  label, 
  icon: Icon,
  buttonClassName,
  labelClassName,
  menuClassName,
  searchable = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useSearchDebounce(search, 200);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const showSearch = searchable || options.length > 7;
  const filteredOptions = showSearch && debouncedSearch 
    ? options.filter(opt => opt.label.toLowerCase().includes(debouncedSearch.toLowerCase()))
    : options;

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className={labelClassName || "text-[10px] sm:text-xs font-black text-text-secondary capitalize tracking-[0.2em] flex items-center gap-3"}>
          {Icon && <Icon size={14} className="text-accent" />}
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (isOpen) setSearch('');
        }}
        className={buttonClassName || "w-full bg-bg-primary/50 border border-border rounded-xl px-4 py-3 flex items-center justify-between text-left transition-all hover:border-accent/50 focus:outline-none focus:border-accent shadow-sm"}
      >
        <span className={`truncate ${selectedOption ? 'font-bold text-text-primary' : 'font-medium text-text-secondary/50'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={18} className={`text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className={menuClassName || "absolute top-full left-0 right-0 mt-2 bg-surface-low border border-border rounded-2xl shadow-ambient z-[100] max-h-60 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 duration-300"}>
          {showSearch && (
            <div className="p-2 border-b border-border/20 bg-surface-low sticky top-0 z-10">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search options..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="w-full bg-bg-primary/50 border border-border rounded-xl px-3 py-1.5 text-xs font-semibold text-text-primary placeholder:text-text-secondary/40 pl-8 focus:outline-none focus:border-accent"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-secondary/40" size={12} />
              </div>
            </div>
          )}
          <div className="overflow-y-auto no-scrollbar py-1">
            {filteredOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setSearch('');
                }}
                className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors hover:bg-accent/10 ${String(value) === String(option.value) ? 'text-accent bg-accent/5 font-bold' : 'text-text-primary font-medium'}`}
              >
                <span className="text-sm">{option.label}</span>
                {String(value) === String(option.value) && <Check size={16} />}
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="px-4 py-3 text-sm text-text-secondary italic text-center">No options found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomSelect;

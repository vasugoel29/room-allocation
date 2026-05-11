import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const CustomSelect = ({ value, onChange, options, placeholder = "Select option", label, icon: Icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  return (
    <div className="space-y-2 relative" ref={containerRef}>
      {label && (
        <label className="text-[10px] sm:text-xs font-black text-text-secondary uppercase tracking-[0.2em] flex items-center gap-3">
          {Icon && <Icon size={14} className="text-accent" />}
          {label}
        </label>
      )}
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-bg-primary/50 border border-border rounded-xl px-4 py-3 flex items-center justify-between text-left transition-all hover:border-accent/50 focus:outline-none focus:border-accent shadow-sm"
      >
        <span className={`truncate font-bold ${selectedOption ? 'text-text-primary' : 'text-text-secondary opacity-50'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={18} className={`text-text-secondary transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-surface-low border border-border rounded-2xl shadow-ambient z-[100] py-2 max-h-60 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-colors hover:bg-accent/10 ${String(value) === String(option.value) ? 'text-accent bg-accent/5 font-bold' : 'text-text-primary font-medium'}`}
            >
              <span className="text-sm">{option.label}</span>
              {String(value) === String(option.value) && <Check size={16} />}
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-4 py-3 text-sm text-text-secondary italic text-center">No options available</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;

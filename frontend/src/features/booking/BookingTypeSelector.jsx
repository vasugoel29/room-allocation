import React, { useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

const TYPES = [
  { id: 'EXTRA', label: 'Extra Class' },
  { id: 'RESCHEDULE', label: 'Reschedule' },
];

// Keyboard-operable (FE-07): the field opens with Enter/Space/ArrowDown, options are buttons.
function BookingTypeSelector({ bookingType, setBookingType, isTypeOpen, setIsTypeOpen }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isTypeOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsTypeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isTypeOpen, setIsTypeOpen]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setIsTypeOpen(true);
    } else if (e.key === 'Escape' && isTypeOpen) {
      e.stopPropagation();
      setIsTypeOpen(false);
    }
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      <label htmlFor="booking-type" className="text-sm font-bold text-text-primary">Booking Type</label>
      <div className="relative">
        <div className="relative cursor-pointer">
          <input
            id="booking-type"
            type="text"
            readOnly
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isTypeOpen}
            aria-controls="booking-type-options"
            value={bookingType === 'EXTRA' ? 'Extra Class' : 'Reschedule'}
            onClick={() => setIsTypeOpen(!isTypeOpen)}
            onKeyDown={onKeyDown}
            className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all pr-12 shadow-sm cursor-pointer font-body"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 pointer-events-none" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isTypeOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isTypeOpen && (
          <div 
            id="booking-type-options" 
            role="listbox" 
            aria-label="Booking type" 
            className="absolute top-full left-0 right-0 mt-2 bg-surface-lowest dark:bg-surface-high rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 border border-border/20 dark:border-white/10 p-1.5"
          >
            {TYPES.map((type) => (
              <button
                type="button"
                role="option"
                aria-selected={bookingType === type.id}
                key={type.id}
                onClick={() => {
                  setBookingType(type.id);
                  setIsTypeOpen(false);
                }}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors flex items-center justify-between text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  bookingType === type.id 
                    ? 'bg-primary text-white shadow-sm hover:bg-primary' 
                    : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span>{type.label}</span>
                {bookingType === type.id && <Check size={16} className="text-white shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BookingTypeSelector;

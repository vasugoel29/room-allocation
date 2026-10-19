import React from 'react';

const TYPES = [
  { id: 'EXTRA', label: 'Extra Class' },
  { id: 'RESCHEDULE', label: 'Reschedule' },
];

// Keyboard-operable (FE-07): the field opens with Enter/Space/ArrowDown, options are buttons.
function BookingTypeSelector({ bookingType, setBookingType, isTypeOpen, setIsTypeOpen }) {
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
    <div className="space-y-2">
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
          <div id="booking-type-options" role="listbox" aria-label="Booking type" className="absolute top-full left-0 right-0 mt-3 bg-surface-low dark:bg-surface-mid rounded-3xl shadow-ambient z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300 border border-black/5 dark:border-white/5">
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
                className={`w-full text-left p-5 cursor-pointer transition-colors flex items-center font-extrabold text-[11px] capitalize tracking-widest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${bookingType === type.id ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:bg-black/5 dark:hover:bg-white/5'}`}
              >
                {type.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BookingTypeSelector;

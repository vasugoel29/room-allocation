import React from 'react';

function BookingTypeSelector({ bookingType, setBookingType, isTypeOpen, setIsTypeOpen }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-text-primary">Booking Type</label>
      <div className="relative">
        <div className="relative cursor-pointer" onClick={() => setIsTypeOpen(!isTypeOpen)}>
          <input
            type="text"
            readOnly
            value={bookingType === 'EXTRA' ? 'Extra Class' : 'Reschedule'}
            className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none transition-all pr-12 shadow-inner cursor-pointer font-body pointer-events-none"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isTypeOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isTypeOpen && (
          <div className="absolute top-full left-0 right-0 mt-3 bg-neutral rounded-3xl shadow-ambient z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            {[
              { id: 'EXTRA', label: 'Extra Class' },
              { id: 'RESCHEDULE', label: 'Reschedule' }
            ].map(type => (
              <div
                key={type.id}
                onClick={() => {
                  setBookingType(type.id);
                  setIsTypeOpen(false);
                }}
                className={`p-5 cursor-pointer transition-colors flex items-center font-extrabold text-[11px] uppercase tracking-widest ${bookingType === type.id ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:bg-white/5'}`}
              >
                {type.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BookingTypeSelector;

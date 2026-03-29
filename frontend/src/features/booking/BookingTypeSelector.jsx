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
            className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm font-medium text-text-primary focus:outline-none focus:border-accent transition-all pr-10 shadow-sm cursor-pointer hover:bg-bg-secondary/30 pointer-events-none"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isTypeOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isTypeOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
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
                className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex items-center gap-2 ${bookingType === type.id ? 'bg-accent/10 font-bold border-l-4 border-l-accent' : 'hover:bg-accent/5 font-medium'}`}
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

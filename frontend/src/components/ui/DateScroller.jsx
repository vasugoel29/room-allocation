import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';

/**
 * A mobile-friendly vertical date scroller.
 * Shows Month and Day in a scrollable format.
 */
function DateScroller({ selectedDate, onChange }) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const [month, setMonth] = useState(selectedDate.getMonth());
  const [year, setYear] = useState(selectedDate.getFullYear());
  const [day, setDay] = useState(selectedDate.getDate());

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  useEffect(() => {
    // Correct day if it exceeds the new month's length
    if (day > daysInMonth) setDay(daysInMonth);
    
    const newDate = new Date(year, month, day);
    if (newDate.getTime() !== selectedDate.getTime()) {
      onChange(newDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, day, daysInMonth]);

  const handleScroll = (type, direction) => {
    if (type === 'month') {
      const nextMonth = direction === 'up' ? month - 1 : month + 1;
      if (nextMonth >= 0 && nextMonth < 12) setMonth(nextMonth);
      else if (nextMonth < 0) { setMonth(11); setYear(year - 1); }
      else { setMonth(0); setYear(year + 1); }
    } else if (type === 'day') {
      const nextDay = direction === 'up' ? day - 1 : day + 1;
      if (nextDay >= 1 && nextDay <= daysInMonth) setDay(nextDay);
    } else if (type === 'year') {
        setYear(direction === 'up' ? year - 1 : year + 1);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-6 bg-bg-secondary/30 rounded-3xl border border-border/50 shadow-inner">
      <div className="flex items-center justify-between gap-4">
        {/* Month Scroller */}
        <div className="flex-1 flex flex-col items-center">
          <button onClick={() => handleScroll('month', 'up')} className="p-2 text-text-secondary hover:text-accent transition-colors"><ChevronUp size={20} /></button>
          <div className="w-full text-center bg-bg-primary/50 py-3 rounded-2xl border border-border shadow-sm">
            <span className="text-sm font-black text-text-primary uppercase tracking-widest">{months[month].substring(0, 3)}</span>
          </div>
          <button onClick={() => handleScroll('month', 'down')} className="p-2 text-text-secondary hover:text-accent transition-colors"><ChevronDown size={20} /></button>
        </div>

        {/* Day Scroller */}
        <div className="flex-1 flex flex-col items-center">
          <button onClick={() => handleScroll('day', 'up')} className="p-2 text-text-secondary hover:text-accent transition-colors"><ChevronUp size={20} /></button>
          <div className="w-full text-center bg-bg-primary/50 py-3 rounded-2xl border border-border shadow-sm">
            <span className="text-2xl font-black text-text-primary">{day}</span>
          </div>
          <button onClick={() => handleScroll('day', 'down')} className="p-2 text-text-secondary hover:text-accent transition-colors"><ChevronDown size={20} /></button>
        </div>

        {/* Year Scroller */}
        <div className="flex-1 flex flex-col items-center">
          <button onClick={() => handleScroll('year', 'up')} className="p-2 text-text-secondary hover:text-accent transition-colors"><ChevronUp size={20} /></button>
          <div className="w-full text-center bg-bg-primary/50 py-3 rounded-2xl border border-border shadow-sm">
            <span className="text-sm font-black text-text-primary">{year}</span>
          </div>
          <button onClick={() => handleScroll('year', 'down')} className="p-2 text-text-secondary hover:text-accent transition-colors"><ChevronDown size={20} /></button>
        </div>
      </div>

      <div className="mt-2 text-center">
         <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-full text-accent font-black text-[10px] uppercase tracking-widest shadow-sm">
           <CalendarIcon size={12} />
           {new Date(year, month, day).toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
         </div>
      </div>
    </div>
  );
}

export default DateScroller;

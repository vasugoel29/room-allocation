import { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

function DatePickerDropdown({ selectedDate, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const [viewDate, setViewDate] = useState(() => {
    return selectedDate ? new Date(selectedDate) : new Date();
  });

  useEffect(() => {
    if (selectedDate) setViewDate(new Date(selectedDate));
  }, [selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const { days, prevMonthDays } = useMemo(() => {
    const d = [];
    const prevD = [];
    const daysInPrev = new Date(year, month, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) {
        prevD.unshift(daysInPrev - i);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        d.push(i);
    }
    return { days: d, prevMonthDays: prevD };
  }, [year, month, daysInMonth, firstDay]);

  const handleDayClick = (day) => {
    const newDate = new Date(year, month, day);
    const y = newDate.getFullYear();
    const m = String(newDate.getMonth() + 1).padStart(2, '0');
    const d = String(newDate.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    setIsOpen(false);
  };

  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));

  const displayLabel = useMemo(() => {
    if (!selectedDate) return 'Select Date';
    // Remove local offset adjustment, just parse directly or use string split for accurate text UI
    const [y, m, d] = selectedDate.split('-');
    return `${d}/${m}/${y}`;
  }, [selectedDate]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-bg-primary border border-border rounded-xl px-4 py-2 text-sm font-bold focus:outline-none focus:border-accent flex justify-between items-center gap-3 hover:bg-bg-secondary/50 transition-colors"
      >
        <span className="truncate">{displayLabel}</span>
        <CalendarIcon size={14} className="text-text-secondary" />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/5 z-[60] sm:hidden animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute top-full left-0 right-0 z-[70] mt-2 p-4 bg-bg-primary border border-border rounded-2xl shadow-2xl animate-in slide-in-from-top-2 duration-200 glass sm:min-w-[320px]">
            <div className="flex justify-between items-center mb-6 sm:mb-4">
            <button type="button" onClick={prevMonth} className="p-1 hover:bg-bg-secondary rounded-lg text-text-secondary hover:text-text-primary transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-black text-text-primary">
              {viewDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 hover:bg-bg-secondary rounded-lg text-text-secondary hover:text-text-primary transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(dayName => (
              <div key={dayName} className="text-[10px] font-black text-text-secondary opacity-50 text-center uppercase">
                {dayName}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {prevMonthDays.map((d, i) => (
              <div key={`prev-${i}`} className="p-1.5 text-center text-xs font-medium text-text-secondary opacity-20">
                {d}
              </div>
            ))}
            {days.map(d => {
              const currentDateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const isSelected = selectedDate === currentDateStr;
              const isToday = new Date().toISOString().split('T')[0] === currentDateStr;
              
              return (
                <button
                  key={`day-${d}`}
                  type="button"
                  onClick={() => handleDayClick(d)}
                  className={`p-1.5 text-center text-xs font-bold rounded-lg transition-all ${
                    isSelected 
                      ? 'bg-accent text-white shadow-md shadow-accent/20' 
                      : isToday 
                        ? 'bg-bg-secondary text-accent border border-accent/20' 
                        : 'hover:bg-bg-secondary hover:text-text-primary text-text-secondary'
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          </div>
        </>
      )}
    </div>
  );
}

export default DatePickerDropdown;

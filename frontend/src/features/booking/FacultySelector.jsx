import React, { useRef, useEffect } from 'react';
import { Check } from 'lucide-react';

function FacultySelector({ 
  faculties, 
  selectedFaculty, 
  setSelectedFaculty, 
  isFacultyOpen, 
  setIsFacultyOpen, 
  facultySearchTerm, 
  setFacultySearchTerm, 
  debouncedFacultyTerm 
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isFacultyOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFacultyOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFacultyOpen, setIsFacultyOpen]);

  const selectedFacultyObj = Array.isArray(faculties) 
    ? faculties.find(f => String(f.id) === String(selectedFaculty)) 
    : null;

  return (
    <div className="space-y-2" ref={containerRef}>
      <label className="text-sm font-bold text-text-primary">Supervising Faculty</label>
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            placeholder={selectedFacultyObj ? selectedFacultyObj.name : "Search for faculty..."}
            value={facultySearchTerm}
            onFocus={() => setIsFacultyOpen(true)}
            onChange={(e) => {
              setFacultySearchTerm(e.target.value);
              setIsFacultyOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIsFacultyOpen(true); }
              else if (e.key === 'Escape' && isFacultyOpen) { e.stopPropagation(); setIsFacultyOpen(false); }
            }}
            autoComplete="off"
            role="combobox"
            aria-expanded={isFacultyOpen}
            aria-controls="faculty-options"
            aria-label="Search for faculty"
            className={`w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 text-sm text-text-primary font-bold focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all pr-12 shadow-sm font-body ${
              selectedFacultyObj && !facultySearchTerm 
                ? 'placeholder:text-text-primary placeholder:font-bold placeholder:opacity-100' 
                : 'placeholder:text-text-secondary/40 placeholder:font-normal'
            }`}
          />
          <button
            type="button"
            aria-label={isFacultyOpen ? 'Hide faculty list' : 'Show faculty list'}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer hover:text-text-primary transition-colors"
            onClick={() => setIsFacultyOpen(!isFacultyOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isFacultyOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {isFacultyOpen && (
          <div 
            id="faculty-options" 
            role="listbox" 
            aria-label="Faculty" 
            className="absolute top-full left-0 right-0 mt-2 bg-surface-lowest dark:bg-surface-high rounded-2xl shadow-xl z-50 max-h-56 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-200 border border-border/20 dark:border-white/10 p-1.5"
          >
            {Array.isArray(faculties) && faculties
              ?.filter(f => !debouncedFacultyTerm || 
                            f.name.toLowerCase().includes(debouncedFacultyTerm.toLowerCase()) || 
                            (f.department && f.department.toLowerCase().includes(debouncedFacultyTerm.toLowerCase())))
              .map(f => {
                const isSelected = String(selectedFaculty) === String(f.id);
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    key={f.id}
                    onClick={() => {
                      setSelectedFaculty(f.id);
                      setIsFacultyOpen(false);
                      setFacultySearchTerm('');
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isSelected ? 'bg-primary text-white shadow-sm hover:bg-primary' : ''
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <span className={`text-sm font-semibold tracking-tight truncate ${isSelected ? 'text-white' : 'text-text-primary'}`}>{f.name}</span>
                      <span className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-text-secondary'}`}>{f.department || 'Faculty'}</span>
                    </div>
                    {isSelected && <Check size={16} className="text-white shrink-0" />}
                  </button>
                );
              })}
            {(!Array.isArray(faculties) || faculties?.filter(f => !debouncedFacultyTerm || 
                                    f.name.toLowerCase().includes(debouncedFacultyTerm.toLowerCase()) || 
                                    (f.department && f.department.toLowerCase().includes(debouncedFacultyTerm.toLowerCase()))).length === 0) && (
              <div className="p-3 text-sm text-text-secondary text-center">No faculty found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FacultySelector;

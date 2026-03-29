import React from 'react';

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
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-text-primary">Supervising Faculty</label>
      <div className="relative">
        <div className="relative">
          <input
            type="text"
            placeholder={selectedFaculty ? faculties.find(f => String(f.id) === String(selectedFaculty))?.name : "Search for faculty..."}
            value={facultySearchTerm}
            onFocus={() => setIsFacultyOpen(true)}
            onChange={(e) => {
              setFacultySearchTerm(e.target.value);
              setIsFacultyOpen(true);
            }}
            autoComplete="off"
            aria-label="Search for faculty"
            className="w-full bg-bg-primary border border-border rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-all pr-10 shadow-sm hover:bg-bg-secondary/30"
          />
          <div 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
            onClick={() => setIsFacultyOpen(!isFacultyOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isFacultyOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isFacultyOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-bg-secondary border border-border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto overflow-x-hidden animate-in fade-in slide-in-from-top-2 duration-200 ring-1 ring-black/5">
            {Array.isArray(faculties) && faculties
              ?.filter(f => !debouncedFacultyTerm || 
                            f.name.toLowerCase().includes(debouncedFacultyTerm.toLowerCase()) || 
                            (f.department && f.department.toLowerCase().includes(debouncedFacultyTerm.toLowerCase())))
              .map(f => {
                const isSelected = String(selectedFaculty) === String(f.id);
                return (
                  <div
                    key={f.id}
                    onClick={() => {
                      setSelectedFaculty(f.id);
                      setIsFacultyOpen(false);
                      setFacultySearchTerm('');
                    }}
                    className={`p-3 cursor-pointer border-b border-border last:border-0 transition-colors flex flex-col hover:bg-accent/5 ${isSelected ? 'bg-accent/10 border-l-4 border-l-accent' : ''}`}
                  >
                    <span className="font-bold text-base text-text-primary">{f.name}</span>
                    <span className="text-xs text-text-secondary font-medium truncate">{f.department || f.email}</span>
                  </div>
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

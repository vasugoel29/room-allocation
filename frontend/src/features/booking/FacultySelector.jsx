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
            className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm text-text-primary font-bold focus:outline-none focus:bg-tonal-secondary/20 transition-all pr-12 shadow-inner placeholder:text-text-secondary/20 font-body"
          />
          <div 
            className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 cursor-pointer"
            onClick={() => setIsFacultyOpen(!isFacultyOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${isFacultyOpen ? 'rotate-180' : ''}`}><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>

        {isFacultyOpen && (
          <div className="absolute top-full left-0 right-0 mt-3 bg-neutral rounded-3xl shadow-ambient z-50 max-h-64 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-300">
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
                    className={`p-5 cursor-pointer transition-colors flex flex-col hover:bg-white/5 ${isSelected ? 'bg-primary text-white shadow-ambient' : ''}`}
                  >
                    <span className={`font-extrabold text-lg tracking-tight uppercase font-display ${isSelected ? 'text-white' : 'text-text-primary'}`}>{f.name}</span>
                    <span className={`text-[10px] uppercase tracking-widest font-extrabold truncate ${isSelected ? 'text-white/60' : 'text-text-secondary opacity-40'}`}>{f.department || f.email}</span>
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

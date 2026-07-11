import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Clock, 
  Users, 
  GraduationCap, 
  Calendar, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight, 
  LayoutGrid, 
  Upload, 
  FileText, 
  CheckCircle, 
  Trash2,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import api from '../utils/api';

const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, s => s.toUpperCase());
};

const getShortDept = (dept) => {
  if (!dept) return '';
  const deptMapping = {
    'INFORMATION TECHNOLOGY': 'IT',
    'COMPUTER SCIENCE AND ENGINEERING': 'CS',
    'INSTRUMENTATION AND CONTROL ENGINEERING': 'ICE',
    'ELECTRONICS AND COMMUNICATION ENGINEERING': 'ECE',
    'MECHANICAL ENGINEERING': 'ME',
    'MANUFACTURING PROCESS AND AUTOMATION ENGINEERING': 'MPAE',
    'ELECTRICAL ENGINEERING': 'EE',
    'BIOTECHNOLOGY': 'BT'
  };
  return deptMapping[dept.toUpperCase()] || dept;
};

const getDatesOfWeek = (baseDateStr) => {
  const baseDate = new Date(baseDateStr);
  const currentDay = baseDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  
  // Find Monday of the current week
  const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + mondayOffset);

  const days = [];
  for (let i = 0; i < 5; i++) { // Mon, Tue, Wed, Thu, Fri
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(day.toISOString().split('T')[0]);
  }
  return days;
};

function AdminTimetable() {
  const [searchType, setSearchType] = useState('FACULTY'); // 'FACULTY' | 'SECTION'
  const [facultyName, setFacultyName] = useState('');
  const [dept, setDept] = useState('IT');
  const [year, setYear] = useState('3');
  const [section, setSection] = useState('1');
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState('day'); // 'day' | 'week'
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [csvData, setCsvData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (searchType !== 'FACULTY' || !facultyName.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get(`/timetable/autocomplete/faculty?query=${encodeURIComponent(facultyName)}`);
        if (res.ok) {
          const matches = await res.json();
          if (matches.length === 1 && matches[0].toUpperCase() === facultyName.trim().toUpperCase()) {
            setSuggestions([]);
            setShowSuggestions(false);
          } else {
            setSuggestions(matches);
            setShowSuggestions(true);
          }
        }
      } catch (err) {
        console.error('Autocomplete error:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [facultyName, searchType]);

  const handleSearch = async (nameToSearch) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: searchType });
      if (searchType === 'FACULTY') {
        const targetName = (typeof nameToSearch === 'string') ? nameToSearch : facultyName;
        if (!targetName || !targetName.trim()) {
          toast.error('Please enter a faculty name');
          setLoading(false);
          return;
        }
        params.append('name', targetName);
      }
      else {
        // Calculate Semester from Year
        const currentMonth = new Date().getMonth();
        const isEvenSemester = currentMonth >= 0 && currentMonth <= 5;
        const calculatedSemester = isEvenSemester ? Number(year) * 2 : (Number(year) * 2) - 1;

        params.append('department', dept);
        params.append('semester', String(calculatedSemester));
        params.append('section', section);
      }

      const res = await api.get(`/timetable/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const result = await res.json();
      setData(result);
    } catch (err) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const formatWeekDisplay = (dateStr) => {
    const dates = getDatesOfWeek(dateStr);
    const first = new Date(dates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const last = new Date(dates[dates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${first} - ${last}`;
  };

  const getMergedSchedule = (dateStr) => {
    if (!data) return [];
    
    const targetDay = dateStr || selectedDay;
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(targetDay).getDay()];
    
    // 1. Static Slots
    const staticItems = (data.staticSlots || [])
      .filter(s => s.day_of_week === dayOfWeek)
      .map(s => {
        const hour = parseInt((s.slot_time || '').split(':')[0].slice(-2));
        let realHour = hour;
        if (hour >= 1 && hour < 8) realHour += 12;

        const isOverridden = data.overrides?.some(o => 
          new Date(o.date).toISOString().split('T')[0] === targetDay && o.hour === realHour
        );
        
        if (isOverridden) return null;

        return {
          time: realHour,
          displayTime: s.slot_time,
          subject: s.subject_name || s.subject_code,
          room: s.room_name,
          instructor: s.faculty_name,
          className: s.department ? `${getShortDept(s.department)} Sem ${s.semester} (Sec ${s.section})` : '',
          isDynamic: false
        };
      }).filter(Boolean);

    // 2. Dynamic Bookings
    const dynamicItems = (data.dynamicBookings || [])
      .filter(b => new Date(b.start_time).toISOString().split('T')[0] === targetDay)
      .map(b => {
        const bStart = new Date(b.start_time);
        const hour = bStart.getHours();
        return {
          time: hour,
          displayTime: `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`,
          subject: b.purpose,
          room: b.room_name,
          instructor: b.creator_name || 'Booked Slot',
          className: 'Dynamic Booking',
          isDynamic: true
        };
      });

    const combined = [...staticItems, ...dynamicItems].sort((a, b) => a.time - b.time);

    // Deduplicate: same subject + room + time = same slot
    const seen = new Set();
    return combined.filter(item => {
      const key = `${(item.subject || '').toLowerCase()}|${(item.room || '').toLowerCase()}|${item.time}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const weeklySchedule = useMemo(() => {
    if (viewMode !== 'week' || !data) return {};
    const dates = getDatesOfWeek(selectedDay);
    const weekData = {};
    
    dates.forEach(date => {
      const merged = getMergedSchedule(date);
      const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
      weekData[dayName] = {
        date,
        slots: merged
      };
    });
    
    return weekData;
  }, [viewMode, data, selectedDay]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        toast.success(`Loaded ${results.data.length} rows`);
      }
    });
  };

  const handleBulkUpload = async () => {
    if (csvData.length === 0) return;
    setIsUploading(true);
    try {
      const response = await api.post('/timetable/upload', { slots: csvData });
      if (response.ok) {
        toast.success("Timetable uploaded successfully!");
        setCsvData([]);
        setShowImport(false);
      } else throw new Error("Upload failed");
    } catch (err) { toast.error(err.message); }
    finally { setIsUploading(false); }
  };

  const schedule = getMergedSchedule();

  return (
    <div className="flex flex-col h-full space-y-6 p-6 sm:p-8 overflow-hidden font-display">
      {/* Header with Search Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-2xl shadow-ambient">
            <LayoutGrid size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-text-primary tracking-tighter uppercase italic">Timetable</h1>
            <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest opacity-40">View class schedules</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-tonal-secondary/10 p-1.5 rounded-2xl border border-border/30 backdrop-blur-md">
           <button 
             onClick={() => { setSearchType('FACULTY'); setData(null); }}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'FACULTY' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
           >
             <GraduationCap size={16} />
             Faculty
           </button>
           <button 
             onClick={() => { setSearchType('SECTION'); setData(null); }}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'SECTION' ? 'bg-surface-low text-primary shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
           >
             <Users size={16} />
             Section
           </button>
        </div>
      </div>

      <main className="flex-1 flex flex-col min-h-0 gap-6">
        {/* Search Controls */}
        {!showImport && (
          <div className="glass rounded-3xl p-6 shadow-ambient border-none flex flex-col sm:flex-row items-end gap-6 animate-in slide-in-from-top-4 duration-500">
            {searchType === 'FACULTY' ? (
              <div className="flex-1 space-y-2">
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1 opacity-50">Faculty Identity</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={20} />
                  <input 
                    value={facultyName}
                    onChange={(e) => setFacultyName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Enter faculty name (e.g. DEEPIKA KUKREJA)"
                    className="w-full bg-bg-primary/50 border border-border rounded-2xl py-4 pl-12 pr-6 text-sm font-bold focus:outline-none focus:border-primary transition-all text-text-primary placeholder:text-text-secondary/20"
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowSuggestions(false)} />
                      <div className="absolute top-full left-0 right-0 mt-2 bg-surface-low border border-border/15 backdrop-blur-md rounded-2xl shadow-xl z-50 overflow-hidden py-1.5 max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150">
                        {suggestions.map((name, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setFacultyName(name);
                              setShowSuggestions(false);
                              handleSearch(name);
                            }}
                            className="w-full px-5 py-3 text-sm font-bold text-left text-text-primary hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div className="space-y-2 text-text-primary">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1 opacity-50">Branch</label>
                  <select 
                    value={dept} 
                    onChange={(e) => setDept(e.target.value)}
                    className="w-full bg-bg-primary/50 border border-border rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-primary text-text-primary"
                  >
                    <option value="IT">IT</option>
                    <option value="CS">CS</option>
                    <option value="ECE">ECE</option>
                  </select>
                </div>
                <div className="space-y-2 text-text-primary">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1 opacity-50">Year</label>
                  <select 
                    value={year} 
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full bg-bg-primary/50 border border-border rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-primary text-text-primary"
                  >
                    {[1,2,3,4].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-2 text-text-primary">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest ml-1 opacity-50">Section</label>
                  <select 
                    value={section} 
                    onChange={(e) => setSection(e.target.value)}
                    className="w-full bg-bg-primary/50 border border-border rounded-2xl p-4 text-sm font-bold focus:outline-none focus:border-primary text-text-primary"
                  >
                    {[1,2,3,4].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
            
            <button 
              onClick={handleSearch}
              disabled={loading}
              className="w-full sm:w-48 bg-primary text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? "Searching..." : "Fetch Schedule"}
            </button>
          </div>
        )}

        {/* Import Interface */}
        {showImport && (
          <div className="glass rounded-3xl p-8 shadow-ambient border-none grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-top-4 duration-500">
            <div className="space-y-4">
               <h2 className="text-xl font-black text-text-primary uppercase tracking-tighter">Bulk Import Engine</h2>
               <div className="relative">
                 <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                 <div className="border-4 border-dashed border-tonal-secondary/20 rounded-[2rem] p-12 flex flex-col items-center justify-center gap-4 hover:bg-primary/5 transition-all">
                    <FileText size={48} className="text-primary opacity-40" />
                    <span className="text-xs font-black uppercase tracking-widest text-text-secondary">Click to select CSV</span>
                 </div>
               </div>
               <button 
                 onClick={handleBulkUpload} 
                 disabled={csvData.length === 0 || isUploading}
                 className="w-full bg-text-primary text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-ambient disabled:opacity-30"
               >
                 {isUploading ? "Uploading Data..." : `Commit ${csvData.length} records`}
               </button>
            </div>
            <div className="bg-tonal-secondary/5 rounded-3xl p-6 space-y-4 border border-border/50">
               <h3 className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-40">Protocol Check</h3>
               <ul className="space-y-4">
                  {['Format headers correctly', 'Use 24h hour integers', 'Check room codes'].map(text => (
                    <li key={text} className="flex items-center gap-3 text-xs font-bold text-text-secondary uppercase tracking-tight">
                       <CheckCircle size={14} className="text-primary" /> {text}
                    </li>
                  ))}
               </ul>
            </div>
          </div>
        )}

        {/* Timetable Results */}
        {!showImport && (
          <div className="flex-1 flex flex-col min-h-0">
             <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-2">
                      <Calendar size={20} className="text-primary" />
                      <h2 className="text-sm font-extrabold uppercase text-text-primary tracking-widest">{viewMode === 'day' ? new Date(selectedDay).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : formatWeekDisplay(selectedDay)}</h2>
                   </div>
                   <div className="flex bg-tonal-secondary/15 p-1 rounded-xl shrink-0">
                      <button
                        onClick={() => setViewMode('day')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'day' ? 'bg-primary text-white shadow-md' : 'text-text-secondary hover:text-text-primary'}`}
                      >
                        Day
                      </button>
                      <button
                        onClick={() => setViewMode('week')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'week' ? 'bg-primary text-white shadow-md' : 'text-text-secondary hover:text-text-primary'}`}
                      >
                        Week
                      </button>
                   </div>
                </div>
                <div className="flex items-center gap-2 bg-tonal-secondary/10 p-1 rounded-xl">
                   <button onClick={() => { const d = new Date(selectedDay); d.setDate(d.getDate() - (viewMode === 'day' ? 1 : 7)); setSelectedDay(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-surface-low rounded-lg transition-all text-text-secondary"><ChevronLeft size={16} /></button>
                   <button onClick={() => { const d = new Date(selectedDay); d.setDate(d.getDate() + (viewMode === 'day' ? 1 : 7)); setSelectedDay(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-surface-low rounded-lg transition-all text-text-secondary"><ChevronRight size={16} /></button>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto no-scrollbar pb-8">
                {data ? (
                  viewMode === 'day' ? (
                    schedule.length > 0 ? (
                      <div className="space-y-3">
                        {schedule.map((item, idx) => (
                          <div key={idx} className={`bg-surface-low/50 border border-border/50 rounded-3xl p-6 flex items-center justify-between hover:border-primary/40 transition-all shadow-sm ${item.isDynamic ? 'border-l-4 border-l-primary ring-1 ring-primary/5' : ''}`}>
                             <div className="flex items-center gap-6">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${item.isDynamic ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-tonal-secondary/10 text-text-secondary'}`}>
                                   {item.isDynamic ? <TrendingUp size={20} /> : <MapPin size={20} />}
                                </div>
                                <div>
                                   <div className="flex items-center gap-3">
                                      <h3 className="text-lg font-black text-text-primary tracking-tight leading-none">{item.subject}</h3>
                                      {item.isDynamic && <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">Updated</span>}
                                   </div>
                                   {searchType === 'FACULTY' ? (
                                     item.className ? <p className="text-[10px] font-extrabold text-text-secondary tracking-wider mt-1.5 opacity-60">{item.className}</p> : null
                                   ) : (
                                     item.instructor ? <p className="text-[10px] font-extrabold text-text-secondary tracking-wider mt-1.5 opacity-60">{toTitleCase(item.instructor)}</p> : null
                                   )}
                                   <div className="flex items-center gap-4 mt-2">
                                      <span className="text-xs font-black text-text-primary flex items-center gap-2">
                                         <Clock size={14} className="text-primary" /> {item.displayTime}
                                      </span>
                                      <span className="text-xs font-black text-primary bg-primary/5 px-3 py-0.5 rounded-lg border border-primary/10">Room {item.room}</span>
                                   </div>
                                </div>
                             </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-20 grayscale opacity-20">
                         <AlertCircle size={64} className="mb-4" />
                         <p className="text-sm font-black uppercase tracking-[.3em]">No Entries Logged</p>
                      </div>
                    )
                  ) : (
                    /* ── Week View: Days as Rows, Slots flow horizontally ── */
                    <div className="rounded-2xl overflow-hidden border border-surface-mid">
                      {Object.entries(weeklySchedule).map(([dayName, dayInfo], rowIdx) => (
                        <div key={dayName} className={`flex items-stretch min-h-[96px] border-b border-surface-mid last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-surface-low' : 'bg-surface-mid'}`}>
                          {/* Day Label */}
                          <div className="w-24 shrink-0 flex flex-col items-center justify-center py-4 border-r border-surface-mid">
                            <p className="text-xs font-black text-primary uppercase tracking-widest">{dayName.slice(0, 3)}</p>
                            <p className="text-[10px] text-text-secondary font-bold mt-1">{new Date(dayInfo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          </div>
                          {/* Slots Row — scrolls horizontally */}
                          <div className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar px-4 py-3 items-stretch">
                            {dayInfo.slots.length > 0 ? (
                              dayInfo.slots.map((item, index) => (
                                <div
                                  key={index}
                                  className={`shrink-0 w-52 flex flex-col justify-between rounded-2xl px-4 py-3 border transition-all ${
                                    item.isDynamic
                                      ? 'bg-primary/15 border-primary/40'
                                      : 'bg-surface-high border-surface-highest'
                                  }`}
                                >
                                  <div>
                                    <p className="text-xs font-black text-text-primary leading-snug">{item.subject}</p>
                                    {searchType === 'FACULTY'
                                      ? item.className ? <p className="text-[10px] font-bold text-text-secondary mt-1">{item.className}</p> : null
                                      : item.instructor ? <p className="text-[10px] font-bold text-text-secondary mt-1">{toTitleCase(item.instructor)}</p> : null
                                    }
                                  </div>
                                  <div className="flex items-center justify-between gap-2 mt-2">
                                    <span className="text-[10px] text-text-secondary font-bold flex items-center gap-1">
                                      <Clock size={10} className="text-primary shrink-0" /> {item.displayTime}
                                    </span>
                                    <span className="text-[10px] text-primary font-black bg-primary/15 px-2 py-0.5 rounded-lg border border-primary/30">{item.room}</span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="flex items-center text-text-secondary/20 text-xs font-bold uppercase tracking-widest">
                                No classes
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 grayscale opacity-10">
                     <Search size={80} className="mb-6" />
                     <p className="text-sm font-black uppercase tracking-[.3em]">Search for a schedule</p>
                  </div>
                )}
             </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminTimetable;

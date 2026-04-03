import React, { useState } from 'react';
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

function AdminTimetable() {
  const [searchType, setSearchType] = useState('FACULTY'); // 'FACULTY' | 'SECTION'
  const [facultyName, setFacultyName] = useState('');
  const [dept, setDept] = useState('IT');
  const [year, setYear] = useState('3');
  const [section, setSection] = useState('1');
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0]);
  
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [csvData, setCsvData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: searchType });
      if (searchType === 'FACULTY') params.append('name', facultyName);
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
      if (result.staticSlots?.length === 0 && result.dynamicBookings?.length === 0) {
        toast.error('No schedule found for this entity');
      } else {
        toast.success(`Found schedule for ${searchType === 'FACULTY' ? result.name : result.department}`);
      }
    } catch (err) {
      toast.error(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const getMergedSchedule = () => {
    if (!data) return [];
    
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(selectedDay).getDay()];
    
    // 1. Static Slots
    const staticItems = (data.staticSlots || [])
      .filter(s => s.day_of_week === dayOfWeek)
      .map(s => {
        const hour = parseInt((s.slot_time || '').split(':')[0].slice(-2));
        let realHour = hour;
        if (hour >= 1 && hour < 8) realHour += 12;

        const isOverridden = data.overrides?.some(o => 
          new Date(o.date).toISOString().split('T')[0] === selectedDay && o.hour === realHour
        );
        
        if (isOverridden) return null;

        return {
          time: realHour,
          displayTime: s.slot_time,
          subject: s.subject_name || s.subject_code,
          room: s.room_name,
          instructor: s.faculty_name,
          isDynamic: false
        };
      }).filter(Boolean);

    // 2. Dynamic Bookings
    const dynamicItems = (data.dynamicBookings || [])
      .filter(b => new Date(b.start_time).toISOString().split('T')[0] === selectedDay)
      .map(b => {
        const bStart = new Date(b.start_time);
        const hour = bStart.getHours();
        return {
          time: hour,
          displayTime: `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00`,
          subject: b.purpose,
          room: b.room_name,
          instructor: b.creator_name || 'Booked Slot',
          isDynamic: true
        };
      });

    return [...staticItems, ...dynamicItems].sort((a, b) => a.time - b.time);
  };

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
    <div className="flex flex-col h-full max-h-[calc(100vh-80px)] space-y-6 p-6 sm:p-8 overflow-hidden font-display">
      {/* Header with Search Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary rounded-2xl shadow-ambient">
            <LayoutGrid size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-text-primary tracking-tighter uppercase italic">Global Navigator</h1>
            <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest opacity-40">Cross-institutional schedule search engine</p>
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
           <div className="w-px h-6 bg-border mx-2 opacity-30" />
           <button 
             onClick={() => setShowImport(!showImport)}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showImport ? 'bg-primary text-white shadow-ambient' : 'text-text-secondary hover:text-text-primary'}`}
           >
             <Upload size={16} />
             Import
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
                <div className="flex items-center gap-2">
                   <Calendar size={20} className="text-primary" />
                   <h2 className="text-sm font-extrabold uppercase text-text-primary tracking-widest">{new Date(selectedDay).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</h2>
                </div>
                <div className="flex items-center gap-2 bg-tonal-secondary/10 p-1 rounded-xl">
                   <button onClick={() => { const d = new Date(selectedDay); d.setDate(d.getDate()-1); setSelectedDay(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-surface-low rounded-lg transition-all text-text-secondary"><ChevronLeft size={16} /></button>
                   <button onClick={() => { const d = new Date(selectedDay); d.setDate(d.getDate()+1); setSelectedDay(d.toISOString().split('T')[0]); }} className="p-2 hover:bg-surface-low rounded-lg transition-all text-text-secondary"><ChevronRight size={16} /></button>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-8">
                {data ? (
                  schedule.length > 0 ? (
                    schedule.map((item, idx) => (
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
                               <p className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mt-1.5 opacity-60">{item.instructor}</p>
                               <div className="flex items-center gap-4 mt-2">
                                  <span className="text-xs font-black text-text-primary flex items-center gap-2">
                                     <Clock size={14} className="text-primary" /> {item.displayTime}
                                  </span>
                                  <span className="text-xs font-black text-primary bg-primary/5 px-3 py-0.5 rounded-lg border border-primary/10">Room {item.room}</span>
                               </div>
                            </div>
                         </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 grayscale opacity-20">
                       <AlertCircle size={64} className="mb-4" />
                       <p className="text-sm font-black uppercase tracking-[.3em]">No Entries Logged</p>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 grayscale opacity-10">
                     <Search size={80} className="mb-6" />
                     <p className="text-sm font-black uppercase tracking-[.3em]">Ready for Reconnaissance</p>
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

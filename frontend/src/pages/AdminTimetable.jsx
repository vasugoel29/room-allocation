import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

function AdminTimetable() {
  const { setTimetableData } = useContext(AppContext);
  const [csvData, setCsvData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        toast.success(`Loaded ${results.data.length} rows from CSV`);
      },
      error: (err) => {
        toast.error("Failed to parse CSV: " + err.message);
      }
    });
  };

  const handleBulkUpload = async () => {
    if (csvData.length === 0) return;
    
    setIsUploading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/timetable/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ slots: csvData })
      });

      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || "Timetable uploaded successfully!");
        setCsvData([]);
        // Refresh global timetable data
        const refreshRes = await fetch(`${import.meta.env.VITE_API_URL}/timetable`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (refreshRes.ok) {
            setTimetableData(await refreshRes.json());
        }
      } else {
        throw new Error(data.error || "Upload failed");
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-low p-4 sm:p-8 font-display">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="p-4 rounded-3xl bg-tonal-secondary/10 text-text-secondary hover:bg-primary hover:text-white transition-all shadow-ambient">
              <ArrowLeft size={24} />
            </Link>
            <div>
              <h1 className="text-4xl font-black text-text-primary uppercase tracking-tighter">Timetable Master</h1>
              <p className="text-text-secondary text-sm font-bold opacity-40 uppercase tracking-widest mt-1">Global schedule synchronization engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] opacity-40">System Status</span>
                <span className="text-xs font-black text-primary uppercase tracking-widest flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                    Ready for Ingestion
                </span>
             </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <section className="lg:col-span-1 space-y-6">
            <div className="glass rounded-[2.5rem] p-8 shadow-ambient border-none relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150 duration-700"></div>
              
              <h2 className="text-xl font-black text-text-primary mb-6 uppercase tracking-tight flex items-center gap-3">
                <Upload className="text-primary" size={24} />
                Ingest Schedule
              </h2>

              <div className="space-y-4">
                <div className="relative">
                    <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-4 border-dashed border-tonal-secondary/20 rounded-[2rem] p-10 flex flex-col items-center justify-center gap-4 transition-all group-hover:border-primary/30 group-hover:bg-primary/5">
                        <div className="p-5 rounded-full bg-tonal-secondary/10 text-text-secondary group-hover:bg-primary group-hover:text-white transition-all">
                            <FileText size={32} />
                        </div>
                        <div className="text-center">
                            <span className="block text-sm font-black text-text-primary uppercase tracking-widest">Drop CSV File</span>
                            <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest opacity-40 mt-1">or click to browse</span>
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-3xl bg-tonal-secondary/5 space-y-3">
                    <h3 className="text-[10px] font-black text-text-secondary uppercase tracking-widest opacity-40">Required Schema</h3>
                    <div className="flex flex-wrap gap-2">
                        {['department', 'section', 'day_of_week', 'slot_time', 'subject_name', 'room_name'].map(label => (
                            <span key={label} className="text-[9px] font-black px-3 py-1 rounded-full bg-tonal-secondary/10 text-text-secondary uppercase tracking-widest border border-black/5 dark:border-white/5">{label}</span>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={handleBulkUpload}
                    disabled={csvData.length === 0 || isUploading}
                    className="w-full bg-primary text-white py-5 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-ambient disabled:opacity-30 disabled:grayscale transition-all active:scale-95 flex items-center justify-center gap-3"
                >
                    {isUploading ? "Processing Engine..." : "Commit To Database"}
                    <CheckCircle size={20} />
                </button>
              </div>
            </div>

            {/* Formatting Help */}
            <div className="glass rounded-[2.5rem] p-8 shadow-ambient border-none">
                <h3 className="text-xs font-black text-text-primary mb-4 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle size={16} className="text-tertiary" />
                    Data Protocol
                </h3>
                <ul className="space-y-4">
                    <li className="flex gap-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"></div>
                        <p className="text-[10px] font-bold text-text-secondary leading-relaxed uppercase tracking-widest opacity-60">
                            Headers must strictly match the database schema.
                        </p>
                    </li>
                    <li className="flex gap-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"></div>
                        <p className="text-[10px] font-bold text-text-secondary leading-relaxed uppercase tracking-widest opacity-60">
                            Time should be integer (e.g. 9 for 9:00 AM).
                        </p>
                    </li>
                    <li className="flex gap-4">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0"></div>
                        <p className="text-[10px] font-bold text-text-secondary leading-relaxed uppercase tracking-widest opacity-60">
                            Days: Mon, Tue, Wed, Thu, Fri, Sat, Sun.
                        </p>
                    </li>
                </ul>
            </div>
          </section>

          {/* Table Preview Section */}
          <section className="lg:col-span-2">
            <div className="glass rounded-[2.5rem] shadow-ambient border-none overflow-hidden h-[calc(100vh-250px)] flex flex-col">
              <div className="p-8 border-b border-black/5 dark:border-white/5 flex items-center justify-between shrink-0">
                <h2 className="text-xl font-black text-text-primary uppercase tracking-tight">Ingestion Preview</h2>
                {csvData.length > 0 && (
                    <button 
                        onClick={() => setCsvData([])}
                        className="p-3 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
                    >
                        <Trash2 size={16} />
                        Clear Buffer
                    </button>
                )}
              </div>
              
              <div className="flex-1 overflow-auto no-scrollbar">
                {csvData.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-surface-low/80 backdrop-blur-md z-10">
                      <tr>
                        {Object.keys(csvData[0]).map(key => (
                          <th key={key} className="px-6 py-4 text-[10px] font-black text-text-secondary uppercase tracking-widest border-b border-black/5 dark:border-white/5">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                      {csvData.map((row, i) => (
                        <tr key={i} className="hover:bg-tonal-secondary/5 transition-colors">
                          {Object.values(row).map((val, j) => (
                            <td key={j} className="px-6 py-4 text-[11px] font-bold text-text-primary whitespace-nowrap opacity-80">{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 p-20 grayscale">
                    <FileText size={80} className="mb-6" />
                    <p className="text-sm font-black uppercase tracking-[0.3em]">Buffer Empty</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest mt-2">Awaiting dataset ingestion</p>
                  </div>
                )}
              </div>
              
              <div className="px-8 py-5 bg-tonal-secondary/5 border-t border-black/5 dark:border-white/5 shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest opacity-40">Queue Metadata</span>
                    <span className="text-[11px] font-black text-text-primary uppercase tracking-widest">{csvData.length} records identified</span>
                  </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default AdminTimetable;

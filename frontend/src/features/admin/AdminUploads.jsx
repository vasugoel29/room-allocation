import React, { useState, useRef } from 'react';
import { adminService } from '../../services/adminService';
import { toast } from 'react-hot-toast';
import { Download, UploadCloud, FileSpreadsheet, Shield, User, Database, CheckCircle, XCircle, Loader } from 'lucide-react';

const INITIAL_POLL = { jobId: null, status: null };
const formatLabel = (value) => String(value || '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());

const AdminUploads = () => {
    const [polls, setPolls] = useState({
        faculty: INITIAL_POLL,
        timetable: INITIAL_POLL,
    });
    const intervals = useRef({});

    const triggerDownload = (blob, filename) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleDownloadTemplate = async (type) => {
        try {
            const blob = await adminService.downloadTemplate(type);
            triggerDownload(blob, `${type}_template.csv`);
            toast.success(`${formatLabel(type)} Template Downloaded`);
        } catch (err) {
            toast.error(err.message || `Failed to download template`);
        }
    };

    const handleExportXLSX = async (type, view) => {
        try {
            const blob = await adminService.exportXLSX(type, view);
            triggerDownload(blob, type === 'timetable' ? `${view}_timetable_calendar.xlsx` : `${type}_export.xlsx`);
            const exportTarget = type === 'timetable' ? `${formatLabel(view)} Timetable` : formatLabel(type);
            toast.success(`${exportTarget} Export Complete`);
        } catch (err) {
            toast.error(err.message || `Failed to export ${type}`);
        }
    };

    const clearPoll = (type) => {
        if (intervals.current[type]) {
            clearInterval(intervals.current[type]);
            delete intervals.current[type];
        }
        setPolls(prev => ({ ...prev, [type]: INITIAL_POLL }));
    };

    const startPolling = (type, jobId) => {
        setPolls(prev => ({ ...prev, [type]: { jobId, status: 'processing' } }));
        intervals.current[type] = setInterval(async () => {
            try {
                const result = await adminService.pollJobStatus(jobId);
                if (result.status === 'completed') {
                    clearInterval(intervals.current[type]);
                    delete intervals.current[type];
                    setPolls(prev => ({ ...prev, [type]: { jobId, status: 'completed', message: result.message, skipped: result.skipped || [] } }));
                    toast.success(result.message || `${formatLabel(type)} Imported Successfully`);
                } else if (result.status === 'failed' || result.status === 'not_found') {
                    clearInterval(intervals.current[type]);
                    delete intervals.current[type];
                    setPolls(prev => ({ ...prev, [type]: { jobId, status: 'failed', error: result.error || 'Import failed' } }));
                    toast.error(result.error || `${formatLabel(type)} Import Failed`);
                }
            } catch { /* keep polling on transient network errors */ }
        }, 1500);
    };

    const handleUploadCSV = (type, event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const csvContent = e.target.result;
                const res = await adminService.importCSV(type, csvContent);
                if (res.jobId) {
                    startPolling(type, res.jobId);
                } else {
                    toast.success(res.message || `Successfully Imported ${formatLabel(type)}`);
                }
            } catch (err) {
                toast.error(err.message || `Failed to Upload ${formatLabel(type)}`);
                setPolls(prev => ({ ...prev, [type]: INITIAL_POLL }));
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    const isProcessing = (type) => polls[type].status === 'processing';

    const UploadStatus = ({ type }) => {
        const poll = polls[type];
        if (!poll.status) return null;
        if (poll.status === 'processing') {
            return (
                <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] capitalize font-extrabold tracking-widest text-text-secondary">
                        <Loader size={12} className="animate-spin text-primary" />
                        Processing...
                    </div>
                    <div className="w-full h-1 bg-surface-mid rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{
                            animation: 'indeterminate 1.5s ease-in-out infinite',
                            width: '50%'
                        }} />
                    </div>
                    <style>{`
                        @keyframes indeterminate {
                            0%   { transform: translateX(-100%); }
                            50%  { transform: translateX(100%); }
                            100% { transform: translateX(300%); }
                        }
                    `}</style>
                </div>
            );
        }
        if (poll.status === 'completed') {
            return (
                <div className="mt-3 space-y-2" data-testid={`${type}-import-result`}>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[10px] capitalize font-extrabold tracking-widest text-green-400">
                            <CheckCircle size={12} /> Done
                        </div>
                        <button onClick={() => clearPoll(type)} className="text-[9px] capitalize tracking-widest text-text-secondary hover:text-text-primary font-bold">Dismiss</button>
                    </div>
                    {poll.message && <p className="text-[11px] font-bold text-text-primary">{poll.message}</p>}
                    {poll.skipped?.length > 0 && (
                        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                            <p className="text-[10px] font-black capitalize tracking-widest text-amber-600 mb-1">Skipped rows</p>
                            <ul className="space-y-0.5 max-h-40 overflow-y-auto">
                                {poll.skipped.map(row => (
                                    <li key={row.line} className="text-[11px] font-medium text-text-secondary">
                                        Line {row.line}: {row.reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            );
        }
        if (poll.status === 'failed') {
            return (
                <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[10px] capitalize font-extrabold tracking-widest text-red-400">
                        <XCircle size={12} /> {poll.error || 'Failed'}
                    </div>
                    <button onClick={() => clearPoll(type)} className="text-[9px] capitalize tracking-widest text-text-secondary hover:text-text-primary font-bold">Dismiss</button>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-300">
            <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight font-display capitalize italic">Bulk Uploads</h2>
                <p className="text-text-secondary text-xs capitalize tracking-widest font-bold opacity-50 mt-1">
                    Manage system resources via bulk template CSV downloads and XLSX exports
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Students */}
                <div className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 border border-white/[0.02] hover:bg-tonal-secondary/15 transition-all shadow-ambient flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-primary/20 p-4 rounded-2xl text-primary"><User size={28} /></div>
                            <div>
                                <h3 className="text-lg font-extrabold text-text-primary capitalize tracking-tight font-display">Students Data</h3>
                                <p className="text-[10px] text-text-secondary capitalize tracking-widest font-bold opacity-40">Export Only</p>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed opacity-75 mb-6 font-medium">
                            Export the students known to CRAS. Student accounts and academic details come from the institutional directory, so there is no student import.
                        </p>
                    </div>
                    <button onClick={() => handleExportXLSX('students')} aria-label="Export students" className="w-full bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient">
                        <FileSpreadsheet size={14} className="text-secondary" /> Export
                    </button>
                </div>

                {/* Faculty */}
                <div className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 border border-white/[0.02] hover:bg-tonal-secondary/15 transition-all shadow-ambient flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-tertiary/20 p-4 rounded-2xl text-tertiary"><Shield size={28} /></div>
                            <div>
                                <h3 className="text-lg font-extrabold text-text-primary capitalize tracking-tight font-display">Faculty Data</h3>
                                <p className="text-[10px] text-text-secondary capitalize tracking-widest font-bold opacity-40">CRAS Faculty Directory</p>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed opacity-75 mb-6 font-medium">
                            Maintain the faculty directory used for booking approvals and timetables. Columns: <code className="font-mono text-xs">name,email,department_name,status</code>. Rows are added or updated by email; <code className="font-mono text-xs">status=inactive</code> deactivates an entry. No sign-in accounts are created &mdash; faculty sign in with Google.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => handleDownloadTemplate('faculty')} className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient">
                                <Download size={14} className="text-secondary" /> Template
                            </button>
                            <button onClick={() => handleExportXLSX('faculty')} aria-label="Export faculty" className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient">
                                <FileSpreadsheet size={14} className="text-secondary" /> Export
                            </button>
                        </div>
                        <label className={`relative flex flex-col items-center justify-center w-full py-5 bg-tertiary/5 hover:bg-tertiary/10 border border-dashed border-tertiary/25 rounded-2xl cursor-pointer transition-all group ${isProcessing('faculty') ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex flex-col items-center justify-center gap-2">
                                <UploadCloud size={24} className={`text-tertiary transition-transform group-hover:-translate-y-0.5 duration-300 ${isProcessing('faculty') ? 'animate-bounce' : ''}`} />
                                <span className="text-[10px] text-text-primary capitalize font-extrabold tracking-widest">
                                    {isProcessing('faculty') ? 'Uploading...' : 'Upload Faculty CSV'}
                                </span>
                            </div>
                            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleUploadCSV('faculty', e)} disabled={isProcessing('faculty')} />
                        </label>
                        <UploadStatus type="faculty" />
                    </div>
                </div>

                {/* Timetable */}
                <div className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 border border-white/[0.02] hover:bg-tonal-secondary/15 transition-all shadow-ambient flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-secondary/20 p-4 rounded-2xl text-secondary"><Database size={28} /></div>
                            <div>
                                <h3 className="text-lg font-extrabold text-text-primary capitalize tracking-tight font-display">Timetable Data</h3>
                                <p className="text-[10px] text-text-secondary capitalize tracking-widest font-bold opacity-40">Schedule &amp; Allocation</p>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed opacity-75 mb-6 font-medium">
                            Download separate weekly Excel calendars by faculty or by room, with days as columns and time slots as rows.
                        </p>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                            <button onClick={() => handleDownloadTemplate('timetable')} className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient">
                                <Download size={14} className="text-secondary" /> Template
                            </button>
                            <button onClick={() => handleExportXLSX('timetable', 'faculty')} className="bg-tonal-secondary/15 text-text-primary px-3 py-3 rounded-xl font-extrabold text-[9px] capitalize tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-white/[0.02] shadow-ambient">
                                <FileSpreadsheet size={14} className="text-secondary" /> Faculty XLSX
                            </button>
                            <button onClick={() => handleExportXLSX('timetable', 'room')} className="bg-tonal-secondary/15 text-text-primary px-3 py-3 rounded-xl font-extrabold text-[9px] capitalize tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 border border-white/[0.02] shadow-ambient">
                                <FileSpreadsheet size={14} className="text-secondary" /> Room XLSX
                            </button>
                        </div>
                        <label className={`relative flex flex-col items-center justify-center w-full py-5 bg-secondary/5 hover:bg-secondary/10 border border-dashed border-secondary/25 rounded-2xl cursor-pointer transition-all group ${isProcessing('timetable') ? 'opacity-50 pointer-events-none' : ''}`}>
                            <div className="flex flex-col items-center justify-center gap-2">
                                <UploadCloud size={24} className={`text-secondary transition-transform group-hover:-translate-y-0.5 duration-300 ${isProcessing('timetable') ? 'animate-bounce' : ''}`} />
                                <span className="text-[10px] text-text-primary capitalize font-extrabold tracking-widest">
                                    {isProcessing('timetable') ? 'Uploading...' : 'Upload Timetable CSV'}
                                </span>
                            </div>
                            <input type="file" accept=".csv" className="hidden" onChange={(e) => handleUploadCSV('timetable', e)} disabled={isProcessing('timetable')} />
                        </label>
                        <UploadStatus type="timetable" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminUploads;

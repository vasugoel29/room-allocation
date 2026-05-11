import React, { useState } from 'react';
import { adminService } from '../../services/adminService';
import { toast } from 'react-hot-toast';
import { Download, UploadCloud, FileSpreadsheet, Shield, User, Database, AlertCircle } from 'lucide-react';

const AdminUploads = () => {
    const [loading, setLoading] = useState({
        students: false,
        faculty: false,
        timetable: false
    });

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
            toast.success(`${type} template downloaded`);
        } catch (err) {
            toast.error(err.message || `Failed to download template`);
        }
    };

    const handleExportXLSX = async (type) => {
        try {
            const blob = await adminService.exportXLSX(type);
            triggerDownload(blob, `${type}_export.xlsx`);
            toast.success(`${type} export complete`);
        } catch (err) {
            toast.error(err.message || `Failed to export ${type}`);
        }
    };

    const handleUploadCSV = (type, event) => {
        const file = event.target.files[0];
        if (!file) return;

        setLoading(prev => ({ ...prev, [type]: true }));
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const csvContent = e.target.result;
                const res = await adminService.importCSV(type, csvContent);
                toast.success(res.message || `Successfully imported ${type}`);
                event.target.value = ''; // Reset input
            } catch (err) {
                toast.error(err.message || `Failed to upload ${type}`);
            } finally {
                setLoading(prev => ({ ...prev, [type]: false }));
            }
        };

        reader.readAsText(file);
    };

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-300">
            <div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight font-display uppercase italic">Bulk Uploads</h2>
                <p className="text-text-secondary text-xs uppercase tracking-widest font-bold opacity-50 mt-1">
                    Manage system resources via bulk template CSV downloads and XLSX exports
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Students Upload Card */}
                <div className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 border border-white/[0.02] hover:bg-tonal-secondary/15 transition-all shadow-ambient flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-primary/20 p-4 rounded-2xl text-primary">
                                <User size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-text-primary uppercase tracking-tight font-display">Students Data</h3>
                                <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold opacity-40">Roles & Profiles</p>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed opacity-75 mb-6 font-medium">
                            Import or export bulk student viewer profiles with custom properties (departments, branches, roll no, degree).
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleDownloadTemplate('students')}
                                className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient"
                            >
                                <Download size={14} className="text-secondary" />
                                Template
                            </button>
                            <button
                                onClick={() => handleExportXLSX('students')}
                                className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient"
                            >
                                <FileSpreadsheet size={14} className="text-secondary" />
                                Export
                            </button>
                        </div>
                        <div>
                            <label className="relative flex flex-col items-center justify-center w-full py-5 bg-primary/5 hover:bg-primary/10 border border-dashed border-primary/25 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <UploadCloud size={24} className={`text-primary transition-transform group-hover:-translate-y-0.5 duration-300 ${loading.students ? 'animate-bounce' : ''}`} />
                                    <span className="text-[10px] text-text-primary uppercase font-extrabold tracking-widest">
                                        {loading.students ? 'Uploading...' : 'Upload Students CSV'}
                                    </span>
                                </div>
                                <input
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleUploadCSV('students', e)}
                                    disabled={loading.students}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Faculty Upload Card */}
                <div className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 border border-white/[0.02] hover:bg-tonal-secondary/15 transition-all shadow-ambient flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-tertiary/20 p-4 rounded-2xl text-tertiary">
                                <Shield size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-text-primary uppercase tracking-tight font-display">Faculty Data</h3>
                                <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold opacity-40">Instructors & Leads</p>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed opacity-75 mb-6 font-medium">
                            Manage all faculty and instructors by uploading the complete department mapping.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleDownloadTemplate('faculty')}
                                className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient"
                            >
                                <Download size={14} className="text-secondary" />
                                Template
                            </button>
                            <button
                                onClick={() => handleExportXLSX('faculty')}
                                className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient"
                            >
                                <FileSpreadsheet size={14} className="text-secondary" />
                                Export
                            </button>
                        </div>
                        <div>
                            <label className="relative flex flex-col items-center justify-center w-full py-5 bg-tertiary/5 hover:bg-tertiary/10 border border-dashed border-tertiary/25 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <UploadCloud size={24} className={`text-tertiary transition-transform group-hover:-translate-y-0.5 duration-300 ${loading.faculty ? 'animate-bounce' : ''}`} />
                                    <span className="text-[10px] text-text-primary uppercase font-extrabold tracking-widest">
                                        {loading.faculty ? 'Uploading...' : 'Upload Faculty CSV'}
                                    </span>
                                </div>
                                <input
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleUploadCSV('faculty', e)}
                                    disabled={loading.faculty}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Timetable Upload Card */}
                <div className="bg-tonal-secondary/10 rounded-[2.5rem] p-8 border border-white/[0.02] hover:bg-tonal-secondary/15 transition-all shadow-ambient flex flex-col justify-between h-full">
                    <div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-secondary/20 p-4 rounded-2xl text-secondary">
                                <Database size={28} />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-text-primary uppercase tracking-tight font-display">Timetable Data</h3>
                                <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold opacity-40">Schedule & Allocation</p>
                            </div>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed opacity-75 mb-6 font-medium">
                            Populate and replace all class schedules and slot allocations directly from CSV records.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => handleDownloadTemplate('timetable')}
                                className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient"
                            >
                                <Download size={14} className="text-secondary" />
                                Template
                            </button>
                            <button
                                onClick={() => handleExportXLSX('timetable')}
                                className="bg-tonal-secondary/15 text-text-primary px-4 py-3 rounded-xl font-extrabold text-[10px] uppercase tracking-widest hover:bg-tonal-secondary/25 active:scale-95 transition-all flex items-center justify-center gap-2 border border-white/[0.02] shadow-ambient"
                            >
                                <FileSpreadsheet size={14} className="text-secondary" />
                                Export
                            </button>
                        </div>
                        <div>
                            <label className="relative flex flex-col items-center justify-center w-full py-5 bg-secondary/5 hover:bg-secondary/10 border border-dashed border-secondary/25 rounded-2xl cursor-pointer transition-all group">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <UploadCloud size={24} className={`text-secondary transition-transform group-hover:-translate-y-0.5 duration-300 ${loading.timetable ? 'animate-bounce' : ''}`} />
                                    <span className="text-[10px] text-text-primary uppercase font-extrabold tracking-widest">
                                        {loading.timetable ? 'Uploading...' : 'Upload Timetable CSV'}
                                    </span>
                                </div>
                                <input
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={(e) => handleUploadCSV('timetable', e)}
                                    disabled={loading.timetable}
                                />
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminUploads;

import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { toast } from 'react-hot-toast';
import { Search, Clock, User, Activity, ChevronLeft, ChevronRight } from 'lucide-react';

const AdminAuditLog = () => {
    const [logs, setLogs] = useState([]);
    const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const result = await adminService.fetchAuditLogs(page, search);
            setLogs(result.data);
            setMeta(result.meta);
        } catch {
            toast.error('Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    }, [page, search]);

    useEffect(() => {
        const timeout = setTimeout(fetchLogs, 300);
        return () => clearTimeout(timeout);
    }, [fetchLogs]);

    const getActionColor = (action) => {
        if (action.includes('REJECT') || action.includes('CANCEL')) return 'text-red-400 bg-red-400/10';
        if (action.includes('APPROVE') || action.includes('CREATE')) return 'text-emerald-400 bg-emerald-400/10';
        if (action.includes('REQUEST')) return 'text-amber-400 bg-amber-400/10';
        return 'text-blue-400 bg-blue-400/10';
    };

    const formatDate = (dateStr) => {
        return new Date(dateStr).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">System Audit Log</h2>
                    <p className="text-gray-400 text-sm mt-1">Track all critical system actions and entity changes</p>
                </div>
                
                <div className="relative group min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="Search action or user..."
                        className="w-full bg-[#1A1A1A] border-none text-white pl-10 pr-4 py-2.5 rounded-xl focus:ring-2 focus:ring-blue-500/20 transition-all placeholder:text-gray-600"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
            </header>

            <div className="bg-[#1A1A1A] rounded-2xl overflow-hidden border border-white/[0.02]">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {loading ? (
                                Array(5).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan="5" className="px-6 py-4 h-16 bg-white/[0.01]"></td>
                                    </tr>
                                ))
                            ) : logs.length > 0 ? (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/[0.01] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-sm text-gray-300">
                                                <Clock className="w-3.5 h-3.5 text-gray-500" />
                                                {formatDate(log.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-medium text-white">{log.user_name || 'System'}</span>
                                                <span className="text-xs text-gray-500">{log.user_email || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase ${getActionColor(log.action)}`}>
                                                {log.action.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-sm text-gray-300">
                                                <Activity className="w-3.5 h-3.5 text-gray-500" />
                                                {log.entity_type} {log.entity_id && `#${log.entity_id}`}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="max-w-xs truncate text-xs text-gray-500 font-mono bg-black/20 p-2 rounded-lg group-hover:bg-black/40 transition-colors">
                                                {JSON.stringify(log.details)}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="px-6 py-20 text-center text-gray-500">
                                        No logs found matching your criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {meta.totalPages > 1 && (
                    <div className="px-6 py-4 bg-white/[0.01] border-t border-white/[0.05] flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                            Showing <span className="text-white">{(page - 1) * meta.limit + 1}</span> to <span className="text-white">{Math.min(page * meta.limit, meta.total)}</span> of <span className="text-white">{meta.total}</span> logs
                        </span>
                        
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || loading}
                                className="p-2 rounded-lg hover:bg-white/[0.05] disabled:opacity-30 transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5 text-white" />
                            </button>
                            <span className="text-sm text-gray-400 px-2">Page {page} of {meta.totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                                disabled={page === meta.totalPages || loading}
                                className="p-2 rounded-lg hover:bg-white/[0.05] disabled:opacity-30 transition-colors"
                            >
                                <ChevronRight className="w-5 h-5 text-white" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminAuditLog;

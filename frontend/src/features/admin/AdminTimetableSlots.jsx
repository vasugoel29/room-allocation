import React, { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services/adminService';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, X, ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMPTY_FORM = {
    faculty_name: '', semester: '', day_of_week: '', slot_time: '',
    content: '', is_occupied: false, room_id: ''
};

const SlotModal = ({ slot, rooms, onSave, onClose }) => {
    const [form, setForm] = useState(slot ? {
        faculty_name: slot.faculty_name || '',
        semester: slot.semester || '',
        day_of_week: slot.day_of_week || '',
        slot_time: slot.slot_time || '',
        content: slot.content || '',
        is_occupied: slot.is_occupied ?? false,
        room_id: slot.room_id ? String(slot.room_id) : ''
    } : EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.faculty_name || !form.day_of_week || !form.slot_time) {
            toast.error('Faculty name, day, and slot time are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                ...form,
                room_id: form.room_id ? parseInt(form.room_id) : null,
                is_occupied: Boolean(form.is_occupied)
            };
            await onSave(payload);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface rounded-3xl border border-border/20 shadow-2xl w-full max-w-lg p-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-extrabold text-text-primary capitalize tracking-tight font-display">
                            {slot ? 'Edit Slot' : 'Add Slot'}
                        </h3>
                        <p className="text-[10px] text-text-secondary capitalize tracking-widest font-bold opacity-40 mt-0.5">Timetable Entry</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-mid text-text-secondary transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Faculty Name *</label>
                            <input
                                value={form.faculty_name}
                                onChange={e => set('faculty_name', e.target.value)}
                                className="w-full bg-surface-mid border border-border/20 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                                placeholder="e.g. DEEPIKA KUKREJA"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Day *</label>
                            <select
                                value={form.day_of_week}
                                onChange={e => set('day_of_week', e.target.value)}
                                className="w-full bg-surface-mid border border-border/20 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                                required
                            >
                                <option value="">Select day</option>
                                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Slot Time *</label>
                            <input
                                value={form.slot_time}
                                onChange={e => set('slot_time', e.target.value)}
                                className="w-full bg-surface-mid border border-border/20 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                                placeholder="e.g. 09:00-10:00"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Semester</label>
                            <input
                                value={form.semester}
                                onChange={e => set('semester', e.target.value)}
                                className="w-full bg-surface-mid border border-border/20 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                                placeholder="e.g. 4"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Room</label>
                            <select
                                value={form.room_id}
                                onChange={e => set('room_id', e.target.value)}
                                className="w-full bg-surface-mid border border-border/20 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                            >
                                <option value="">No room assigned</option>
                                {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.floor ? ` (Floor ${r.floor})` : ''}</option>)}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[10px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Content / Subject</label>
                            <input
                                value={form.content}
                                onChange={e => set('content', e.target.value)}
                                className="w-full bg-surface-mid border border-border/20 rounded-xl px-4 py-3 text-sm text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                                placeholder="e.g. Data Structures (IT-4-1)"
                            />
                        </div>
                        <div className="col-span-2 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => set('is_occupied', !form.is_occupied)}
                                className={`relative w-10 h-6 rounded-full transition-colors ${form.is_occupied ? 'bg-primary' : 'bg-surface-mid'}`}
                            >
                                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.is_occupied ? 'left-5' : 'left-1'}`} />
                            </button>
                            <span className="text-[11px] capitalize tracking-widest font-extrabold text-text-secondary">
                                Slot is occupied
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 bg-surface-mid text-text-secondary px-4 py-3 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-surface transition-all">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="flex-1 bg-primary text-white px-4 py-3 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:opacity-90 active:scale-95 transition-all disabled:opacity-50">
                            {saving ? 'Saving...' : slot ? 'Update Slot' : 'Create Slot'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AdminTimetableSlots = () => {
    const [slots, setSlots] = useState([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 });
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ faculty_name: '', day_of_week: '', semester: '' });
    const [draftFilters, setDraftFilters] = useState({ faculty_name: '', day_of_week: '', semester: '' });
    const [modal, setModal] = useState(null); // null | { mode: 'add'|'edit', slot?: {} }
    const [deleteConfirm, setDeleteConfirm] = useState(null); // slot id

    const fetchSlots = useCallback(async (page = 1) => {
        setLoading(true);
        try {
            const res = await adminService.listTimetableSlots({ ...filters, page, limit: 50 });
            setSlots(res.data || []);
            setMeta(res.meta || { total: 0, page: 1, limit: 50 });
        } catch (err) {
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchSlots(1); }, [fetchSlots]);

    useEffect(() => {
        adminService.getDepartments().then(() => {}).catch(() => {});
        // Load rooms for the room selector
        adminService.getRoomStatuses(new Date().toISOString().split('T')[0], '09:00')
            .then(() => {})
            .catch(() => {});
        // Fetch rooms list directly
        fetch('/api/rooms', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
            .then(r => r.json())
            .then(data => setRooms(Array.isArray(data) ? data : data.rooms || []))
            .catch(() => {});
    }, []);

    const applyFilters = () => {
        setFilters({ ...draftFilters });
    };

    const clearFilters = () => {
        const empty = { faculty_name: '', day_of_week: '', semester: '' };
        setDraftFilters(empty);
        setFilters(empty);
    };

    const handleSave = async (payload) => {
        try {
            if (modal.mode === 'edit') {
                await adminService.updateTimetableSlot(modal.slot.id, payload);
                toast.success('Slot updated');
            } else {
                await adminService.createTimetableSlot(payload);
                toast.success('Slot created');
            }
            setModal(null);
            fetchSlots(meta.page);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            await adminService.deleteTimetableSlot(id);
            toast.success('Slot deleted');
            setDeleteConfirm(null);
            fetchSlots(meta.page);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const totalPages = Math.ceil(meta.total / meta.limit);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight font-display capitalize italic flex items-center gap-3">
                        <CalendarClock size={22} className="text-secondary" />
                        Timetable Slots
                    </h2>
                    <p className="text-text-secondary text-[10px] capitalize tracking-widest font-bold opacity-40 mt-1">
                        {meta.total} total slot{meta.total !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setModal({ mode: 'add' })}
                    className="flex items-center gap-2 bg-secondary/20 hover:bg-secondary/30 text-secondary border border-secondary/20 px-5 py-2.5 rounded-xl font-extrabold text-[10px] capitalize tracking-widest transition-all active:scale-95"
                >
                    <Plus size={14} /> Add Slot
                </button>
            </div>

            {/* Filters */}
            <div className="bg-surface-mid/50 rounded-2xl border border-border/10 p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                    <label className="block text-[9px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Faculty Name</label>
                    <div className="relative">
                        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                        <input
                            value={draftFilters.faculty_name}
                            onChange={e => setDraftFilters(f => ({ ...f, faculty_name: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && applyFilters()}
                            placeholder="Search faculty..."
                            className="w-full bg-surface border border-border/20 rounded-xl pl-8 pr-3 py-2.5 text-xs text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>
                </div>
                <div className="min-w-[130px]">
                    <label className="block text-[9px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Day</label>
                    <select
                        value={draftFilters.day_of_week}
                        onChange={e => setDraftFilters(f => ({ ...f, day_of_week: e.target.value }))}
                        className="w-full bg-surface border border-border/20 rounded-xl px-3 py-2.5 text-xs text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                    >
                        <option value="">All Days</option>
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                <div className="min-w-[90px]">
                    <label className="block text-[9px] capitalize tracking-widest font-extrabold text-text-secondary mb-1.5">Semester</label>
                    <input
                        value={draftFilters.semester}
                        onChange={e => setDraftFilters(f => ({ ...f, semester: e.target.value }))}
                        placeholder="e.g. 4"
                        className="w-full bg-surface border border-border/20 rounded-xl px-3 py-2.5 text-xs text-text-primary font-medium focus:outline-none focus:border-primary/50 transition-colors"
                    />
                </div>
                <div className="flex gap-2">
                    <button onClick={applyFilters} className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 px-4 py-2.5 rounded-xl font-extrabold text-[9px] capitalize tracking-widest transition-all">
                        Filter
                    </button>
                    <button onClick={clearFilters} className="bg-surface hover:bg-surface-mid text-text-secondary border border-border/10 px-4 py-2.5 rounded-xl font-extrabold text-[9px] capitalize tracking-widest transition-all">
                        Clear
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-border/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-surface-mid/60 border-b border-border/10">
                                {['Faculty', 'Day', 'Slot Time', 'Semester', 'Room', 'Content', 'Occupied', ''].map(h => (
                                    <th key={h} className="text-left px-4 py-3 text-[9px] capitalize tracking-widest font-extrabold text-text-secondary">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-12 text-text-secondary text-sm">Loading slots...</td></tr>
                            ) : slots.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-12 text-text-secondary text-sm">No slots found. Upload a timetable CSV or add slots manually.</td></tr>
                            ) : slots.map((slot, i) => (
                                <tr key={slot.id} className={`border-b border-border/5 hover:bg-surface-mid/30 transition-colors ${i % 2 === 0 ? '' : 'bg-surface-mid/10'}`}>
                                    <td className="px-4 py-3 font-bold text-text-primary text-xs">{slot.faculty_name}</td>
                                    <td className="px-4 py-3 text-text-secondary text-xs font-medium">{slot.day_of_week}</td>
                                    <td className="px-4 py-3 text-text-secondary text-xs font-mono">{slot.slot_time}</td>
                                    <td className="px-4 py-3 text-text-secondary text-xs">{slot.semester || '—'}</td>
                                    <td className="px-4 py-3 text-xs">
                                        {slot.room_name ? (
                                            <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-lg font-bold text-[10px]">{slot.room_name}</span>
                                        ) : (
                                            <span className="text-text-secondary opacity-40">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-text-secondary text-xs max-w-[200px] truncate">{slot.content || '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-0.5 rounded-lg font-extrabold text-[9px] capitalize tracking-widest ${slot.is_occupied ? 'bg-primary/15 text-primary' : 'bg-surface-mid text-text-secondary'}`}>
                                            {slot.is_occupied ? 'Yes' : 'No'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setModal({ mode: 'edit', slot })}
                                                className="p-1.5 rounded-lg hover:bg-surface-mid text-text-secondary hover:text-primary transition-colors"
                                                title="Edit slot"
                                            >
                                                <Pencil size={13} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirm(slot.id)}
                                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-colors"
                                                title="Delete slot"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border/10 bg-surface-mid/30">
                        <span className="text-[10px] capitalize tracking-widest font-bold text-text-secondary">
                            Page {meta.page} of {totalPages} · {meta.total} slots
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => fetchSlots(meta.page - 1)} disabled={meta.page <= 1} className="p-1.5 rounded-lg hover:bg-surface-mid text-text-secondary disabled:opacity-30 transition-colors">
                                <ChevronLeft size={16} />
                            </button>
                            <button onClick={() => fetchSlots(meta.page + 1)} disabled={meta.page >= totalPages} className="p-1.5 rounded-lg hover:bg-surface-mid text-text-secondary disabled:opacity-30 transition-colors">
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {modal && (
                <SlotModal
                    slot={modal.slot}
                    rooms={rooms}
                    onSave={handleSave}
                    onClose={() => setModal(null)}
                />
            )}

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-surface rounded-2xl border border-border/20 p-6 max-w-sm w-full space-y-4">
                        <p className="text-sm font-bold text-text-primary">Delete this timetable slot?</p>
                        <p className="text-xs text-text-secondary">This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setDeleteConfirm(null)} className="flex-1 bg-surface-mid text-text-secondary px-4 py-2.5 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-surface transition-all">Cancel</button>
                            <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2.5 rounded-xl font-extrabold text-[10px] capitalize tracking-widest hover:bg-red-500/30 transition-all">Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTimetableSlots;

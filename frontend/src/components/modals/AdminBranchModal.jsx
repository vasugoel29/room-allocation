import { GitBranch, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

function AdminBranchModal({ isOpen, onClose, editingBranch, departments, fetchBranches }) {
  const [form, setForm] = useState({ name: '', short_code: '', department_id: '' });

  useEffect(() => {
    setForm(editingBranch
      ? { name: editingBranch.name || '', short_code: editingBranch.short_code || '', department_id: editingBranch.department_id || '' }
      : { name: '', short_code: '', department_id: '' });
  }, [editingBranch, isOpen]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      if (editingBranch) await adminService.updateBranch(editingBranch.id, form);
      else await adminService.createBranch(form);
      toast.success(editingBranch ? 'Branch updated successfully' : 'Branch created successfully');
      onClose();
      fetchBranches();
    } catch (err) {
      toast.error(err.message || 'Failed to save branch');
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-neutral/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-neutral/90 w-full max-w-sm rounded-[3rem] shadow-ambient overflow-hidden font-display border border-white/5">
        <div className="p-8 flex justify-between items-center bg-tonal-secondary/10"><div className="flex items-center gap-4"><div className="bg-primary/10 p-3 rounded-2xl"><GitBranch className="text-primary" size={24} /></div><div><h2 className="text-xl font-extrabold text-text-primary">{editingBranch ? 'Edit Branch' : 'New Branch'}</h2><p className="text-[10px] font-extrabold text-text-secondary capitalize tracking-widest mt-1 opacity-40">Branch Configuration</p></div></div><button onClick={onClose} className="p-3 hover:bg-tonal-secondary/10 rounded-full text-text-secondary"><X size={20} /></button></div>
        <form onSubmit={submit} className="p-8 space-y-5">
          <label className="block space-y-1.5"><span className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Branch Name</span><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Information Technology" className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50" /></label>
          <label className="block space-y-1.5"><span className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Short Code</span><input value={form.short_code} onChange={(e) => setForm({ ...form, short_code: e.target.value.toUpperCase() })} placeholder="e.g. IT" className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50" /></label>
          <label className="block space-y-1.5"><span className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Department</span><select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50"><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
          <button type="submit" className="w-full py-4.5 bg-primary text-white rounded-2xl font-black capitalize text-xs tracking-widest shadow-ambient">{editingBranch ? 'Save Changes' : 'Create Branch'}</button>
        </form>
      </div>
    </div>
  );
}

export default AdminBranchModal;

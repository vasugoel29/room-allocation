import { X, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

function AdminDepartmentModal({ isOpen, onClose, editingDept, fetchDepts }) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (editingDept) {
      setName(editingDept.name);
    } else {
      setName('');
    }
  }, [editingDept, isOpen]);

  const handleDeptSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await adminService.updateDepartment(editingDept.id, name);
      } else {
        await adminService.createDepartment(name);
      }
      
      toast.success(editingDept ? 'Department updated successfully' : 'Department created successfully');
      onClose();
      fetchDepts();
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-neutral/90 w-full max-w-sm rounded-[3rem] shadow-ambient overflow-hidden animate-in fade-in zoom-in duration-300 font-display border border-white/5">
        <div className="p-8 flex justify-between items-center bg-tonal-secondary/10">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl shadow-ambient">
              <Layers className="text-primary" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-text-primary uppercase tracking-tight leading-none animate-pulse">
                {editingDept ? 'Edit Dept' : 'New Dept'}
              </h2>
              <p className="text-[10px] font-extrabold text-text-secondary uppercase tracking-widest mt-1 opacity-40">
                Department Configuration
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-tonal-secondary/10 rounded-full transition-all text-text-secondary">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleDeptSubmit} className="p-8 space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Department Name</label>
            <input 
              required
              type="text"
              placeholder="e.g. Department of CSE"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
            />
          </div>

          <button 
            type="submit" 
            className="w-full py-4.5 bg-primary text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-ambient active:scale-[0.98] transition-all"
          >
            {editingDept ? 'Save Changes' : 'Create Department'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminDepartmentModal;

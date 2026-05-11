import { X, User as UserIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';
import DepartmentSelect from '../../features/auth/DepartmentSelect';
import StudentFields from '../../features/auth/StudentFields';

function AdminUserModal({ isOpen, onClose, editingUser, fetchUsers, departments }) {
  const [userForm, setUserForm] = useState({ 
    name: '', email: '', role: 'VIEWER', password: '', 
    branch: '', year: 1, section: 1, departmentName: '' 
  });
  
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isSectionOpen, setIsSectionOpen] = useState(false);

  useEffect(() => {
    if (editingUser) {
      setUserForm({ 
        name: editingUser.name, 
        email: editingUser.email, 
        role: editingUser.role, 
        password: '',
        branch: editingUser.branch || '',
        year: editingUser.year || 1,
        section: editingUser.section || 1,
        departmentName: editingUser.department_name || ''
      });
    } else {
      setUserForm({ 
        name: '', email: '', role: 'VIEWER', password: '', 
        branch: '', year: 1, section: 1, departmentName: '' 
      });
    }
  }, [editingUser, isOpen]);

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await adminService.updateUser(editingUser.id, userForm);
      } else {
        await adminService.createUser(userForm);
      }
      
      toast.success(editingUser ? 'User updated' : 'User created');
      onClose();
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Operation failed');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
       <div className="bg-neutral/90 w-full max-w-md rounded-[3rem] shadow-ambient overflow-hidden animate-in fade-in zoom-in duration-300 font-display">
          <div className="p-8 flex justify-between items-center bg-tonal-secondary/10">
             <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl shadow-ambient">
                   <UserIcon className="text-primary" size={24} />
                </div>
                <div>
                   <h2 className="text-xl font-extrabold text-text-primary uppercase tracking-tight leading-none">{editingUser ? 'Edit Registry' : 'New Observer'}</h2>
                   <p className="text-[10px] font-extrabold text-text-secondary uppercase tracking-widest mt-1 opacity-40">User Access Management</p>
                </div>
             </div>
             <button onClick={onClose} className="p-3 hover:bg-tonal-secondary/10 rounded-full transition-all text-text-secondary">
                <X size={20} />
             </button>
          </div>

          <form onSubmit={handleUserSubmit} className="p-8 space-y-6">
             <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Legal Identity / Name</label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. John Doe"
                  value={userForm.name}
                  onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                  className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Operational Email</label>
                <input 
                  required
                  type="email"
                  placeholder="john@campus.edu"
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Authority Role</label>
                <select 
                  value={userForm.role}
                  onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                  className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-extrabold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner appearance-none uppercase tracking-tight"
                >
                    <option value="VIEWER">VIEWER (Student)</option>
                    <option value="STUDENT_REP">STUDENT_REP (Lead)</option>
                    <option value="FACULTY">FACULTY (Staff)</option>
                    <option value="admin">ADMIN (Root Access)</option>
                </select>
             </div>

             <DepartmentSelect 
               departments={departments}
               departmentName={userForm.departmentName || ''}
               setDepartmentName={(val) => setUserForm({...userForm, departmentName: val})}
               isDeptOpen={isDeptOpen}
               setIsDeptOpen={setIsDeptOpen}
             />
             
             {(userForm.role === 'STUDENT_REP' || userForm.role === 'VIEWER') && (
               <div className="space-y-6 pt-4">
                 <StudentFields
                    branch={userForm.branch || ''}
                    setBranch={(val) => setUserForm({...userForm, branch: val})}
                    year={userForm.year}
                    setYear={(val) => setUserForm({...userForm, year: val})}
                    isYearOpen={isYearOpen}
                    setIsYearOpen={setIsYearOpen}
                    section={userForm.section}
                    setSection={(val) => setUserForm({...userForm, section: val})}
                    isSectionOpen={isSectionOpen}
                    setIsSectionOpen={setIsSectionOpen}
                 />
               </div>
             )}

             {!editingUser && (
               <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] px-1 opacity-40">Temporal Access Key</label>
                  <input 
                    required
                    type="password"
                    placeholder="••••••••"
                    value={userForm.password}
                    onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                    className="w-full bg-tonal-secondary/10 rounded-2xl px-5 py-4 text-sm font-bold text-text-primary focus:outline-none focus:bg-tonal-secondary/20 transition-all shadow-inner font-body"
                  />
               </div>
             )}
             <button 
               type="submit"
               className="w-full bg-primary text-white py-5 rounded-[2rem] font-extrabold shadow-ambient active:scale-[0.98] transition-all mt-6 uppercase tracking-widest text-xs"
             >
               {editingUser ? 'Synchronize Registry' : 'Establish Access'}
             </button>
          </form>
       </div>
    </div>
  );
}

export default AdminUserModal;

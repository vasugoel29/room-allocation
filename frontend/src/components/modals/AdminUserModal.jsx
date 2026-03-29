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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
       <div className="bg-bg-primary w-full max-w-md rounded-[2rem] shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in duration-200">
          <div className="p-6 border-b border-border flex justify-between items-center bg-bg-secondary/30">
             <div className="flex items-center gap-3">
                <div className="bg-accent/10 p-2 rounded-xl">
                   <UserIcon className="text-accent" size={24} />
                </div>
                <h2 className="text-xl font-black text-text-primary capitalize">{editingUser ? 'Edit User' : 'Add New User'}</h2>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors">
                <X size={20} className="text-text-secondary" />
             </button>
          </div>

          <form onSubmit={handleUserSubmit} className="p-6 space-y-5">
             <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Full Name</label>
                <input 
                  required
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                  className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                />
             </div>
             <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Email Address</label>
                <input 
                  required
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                />
             </div>
             <div className="space-y-1.5">
                <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Assign Role</label>
                <select 
                  value={userForm.role}
                  onChange={(e) => setUserForm({...userForm, role: e.target.value})}
                  className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent appearance-none"
                >
                    <option value="VIEWER">VIEWER (Student)</option>
                    <option value="STUDENT_REP">STUDENT_REP (Student Lead)</option>
                    <option value="FACULTY">FACULTY (Staff)</option>
                    <option value="admin">ADMIN (Root)</option>
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
               <div className="space-y-4 pt-2 border-t border-border/50">
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
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-text-secondary uppercase tracking-widest px-1">Initial Password</label>
                  <input 
                    required
                    type="password"
                    placeholder="••••••••"
                    value={userForm.password}
                    onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                    className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-accent"
                  />
               </div>
             )}
             <button 
               type="submit"
               className="w-full bg-accent text-white py-4 rounded-xl font-black shadow-lg shadow-accent/20 hover:opacity-90 active:scale-[0.98] transition-all mt-4"
             >
               {editingUser ? 'Update User Details' : 'Create Access Account'}
             </button>
          </form>
       </div>
    </div>
  );
}

export default AdminUserModal;

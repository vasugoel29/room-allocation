import { X, User as UserIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';
import DepartmentSelect from '../../features/auth/DepartmentSelect';
import StudentFields from '../../features/auth/StudentFields';
import CustomSelect from '../ui/CustomSelect';

function AdminUserModal({ isOpen, onClose, editingUser, fetchUsers, departments }) {
  const [userForm, setUserForm] = useState({ 
    name: '', email: '', role: 'VIEWER', password: '', 
    branch_id: '', year: 1, semester: 1, section: 1, group_name: 1, department_id: '' 
  });
  
  const [branches, setBranches] = useState([]);
  const [isDeptOpen, setIsDeptOpen] = useState(false);
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isSectionOpen, setIsSectionOpen] = useState(false);

  // Fetch branches for student fields dropdown
  useEffect(() => {
    if (isOpen) {
      adminService.getBranches()
        .then(data => setBranches(Array.isArray(data) ? data : (data.branches || [])))
        .catch(err => console.error('Failed to fetch branches', err));
    }
  }, [isOpen]);

  useEffect(() => {
    if (editingUser) {
      setUserForm({ 
        name: editingUser.name, 
        email: editingUser.email, 
        role: editingUser.role, 
        password: '',
        branch_id: editingUser.branch_id || '',
        year: editingUser.year || 1,
        semester: editingUser.semester || Math.min((editingUser.year || 1) * 2, 8),
        section: editingUser.section || 1,
        group_name: editingUser.group_name || 1,
        department_id: editingUser.department_id || ''
      });
    } else {
      setUserForm({ 
        name: '', email: '', role: 'VIEWER', password: '', 
        branch_id: '', year: 1, semester: 1, section: 1, group_name: 1, department_id: '' 
      });
    }
  }, [editingUser, isOpen]);

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...userForm,
        branch_id: userForm.role === 'FACULTY' ? null : (userForm.branch_id ? Number(userForm.branch_id) : null),
        department_id: userForm.department_id ? Number(userForm.department_id) : null,
        year: userForm.role === 'FACULTY' ? null : Number(userForm.year),
        semester: userForm.role === 'FACULTY' ? null : Number(userForm.semester),
        section: userForm.role === 'FACULTY' ? null : Number(userForm.section),
        group_name: userForm.role === 'FACULTY' ? null : Number(userForm.group_name)
      };

      if (editingUser) {
        await adminService.updateUser(editingUser.id, payload);
      } else {
        await adminService.createUser(payload);
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
       <div className="bg-neutral/90 w-full max-w-md rounded-[3rem] shadow-ambient animate-in fade-in zoom-in duration-300 font-display">
          <div className="p-8 flex justify-between items-center bg-tonal-secondary/10 rounded-t-[3rem]">
             <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-2xl shadow-ambient">
                   <UserIcon className="text-primary" size={24} />
                </div>
                <div>
                   <h2 className="text-xl font-extrabold text-text-primary capitalize tracking-tight leading-none">{editingUser ? 'Edit Registry' : 'New Observer'}</h2>
                   <p className="text-[10px] font-extrabold text-text-secondary capitalize tracking-widest mt-1 opacity-40">User Access Management</p>
                </div>
             </div>
             <button onClick={onClose} className="p-3 hover:bg-tonal-secondary/10 rounded-full transition-all text-text-secondary">
                <X size={20} />
             </button>
          </div>

          <form onSubmit={handleUserSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar">
             <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Legal Identity / Name</label>
                <input 
                  required
                  type="text"
                  placeholder="e.g. John Doe"
                  value={userForm.name}
                  onChange={(e) => setUserForm({...userForm, name: e.target.value})}
                  className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-secondary/40 placeholder:font-normal font-body"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Operational Email</label>
                <input 
                  required
                  type="email"
                  placeholder="john@campus.edu"
                  value={userForm.email}
                  onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                  className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-secondary/40 placeholder:font-normal font-body"
                />
             </div>
             <div className="space-y-2">
                <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Authority Role</label>
                <CustomSelect 
                  value={userForm.role}
                  onChange={(val) => setUserForm({...userForm, role: val})}
                  options={[
                    { value: 'VIEWER', label: 'VIEWER (Student)' },
                    { value: 'STUDENT_REP', label: 'STUDENT_REP (Lead)' },
                    { value: 'FACULTY', label: 'FACULTY (Staff)' },
                    { value: 'ADMIN', label: 'ADMIN (Root Access)' }
                  ]}
                  buttonClassName="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all font-body flex items-center justify-between text-left"
                />
             </div>

             <DepartmentSelect 
               departments={departments}
               departmentId={userForm.department_id}
               setDepartmentId={(val) => setUserForm({...userForm, department_id: val})}
               isDeptOpen={isDeptOpen}
               setIsDeptOpen={setIsDeptOpen}
             />
             
             {(userForm.role === 'STUDENT_REP' || userForm.role === 'VIEWER') && (
               <div className="space-y-6 pt-4">
                 <StudentFields
                    branches={branches}
                    branchId={userForm.branch_id}
                    setBranchId={(val) => setUserForm({...userForm, branch_id: val})}
                    year={userForm.year}
                    setYear={(val) => setUserForm({...userForm, year: val})}
                    isYearOpen={isYearOpen}
                    setIsYearOpen={setIsYearOpen}
                    section={userForm.section}
                    setSection={(val) => setUserForm({...userForm, section: val})}
                    isSectionOpen={isSectionOpen}
                    setIsSectionOpen={setIsSectionOpen}
                 />
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Semester</label>
                     <CustomSelect
                       value={String(userForm.semester)}
                       onChange={(value) => {
                         const semester = Number(value);
                         setUserForm({ ...userForm, semester, year: Math.ceil(semester / 2) });
                       }}
                       options={Array.from({ length: 8 }, (_, index) => ({ value: String(index + 1), label: `Semester ${index + 1}` }))}
                       buttonClassName="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all font-body flex items-center justify-between text-left"
                     />
                   </div>
                   <div className="space-y-2">
                     <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Group</label>
                     <CustomSelect
                       value={String(userForm.group_name)}
                       onChange={(value) => setUserForm({ ...userForm, group_name: Number(value) })}
                       options={Array.from({ length: 10 }, (_, index) => ({ value: String(index + 1), label: `Group ${index + 1}` }))}
                       buttonClassName="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all font-body flex items-center justify-between text-left"
                     />
                   </div>
                 </div>
               </div>
             )}

             {!editingUser && (
               <div className="space-y-2">
                  <label className="text-[10px] font-extrabold text-text-secondary capitalize tracking-[0.2em] px-1 opacity-40">Temporal Access Key</label>
                  <input 
                    required
                    type="password"
                    placeholder="••••••••"
                    value={userForm.password}
                    onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                    className="w-full bg-surface-lowest dark:bg-surface-high border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-text-primary focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-text-secondary/40 placeholder:font-normal font-body"
                  />
               </div>
             )}
             <button 
               type="submit"
               className="w-full bg-primary text-white py-5 rounded-[2rem] font-extrabold shadow-ambient active:scale-[0.98] transition-all mt-6 capitalize tracking-widest text-xs"
             >
               {editingUser ? 'Synchronize Registry' : 'Establish Access'}
             </button>
          </form>
       </div>
    </div>
  );
}

export default AdminUserModal;

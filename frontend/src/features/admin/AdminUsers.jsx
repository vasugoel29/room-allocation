import { Mail, Edit, Trash2, CheckCircle, ShieldAlert } from 'lucide-react';
import { getRoleLabel } from '../../utils/roleUtils';

function AdminUsers({ users, searchTerm, onEdit, onDelete, onApprove }) {
  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filteredUsers.length === 0) {
    return <div className="p-20 text-center text-text-secondary uppercase font-black tracking-widest opacity-40">No users found</div>;
  }

  return (
    <div className="flex-1 overflow-auto no-scrollbar">
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
        {filteredUsers.map(item => (
          <div key={item.id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-lg font-black text-text-primary leading-tight">{item.name}</span>
                <div className="flex items-center gap-1.5 text-text-secondary mt-1">
                  <Mail size={12} className="opacity-40" />
                  <span className="text-xs font-medium">{item.email}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${
                  item.role === 'ADMIN' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                }`}>
                  {getRoleLabel(item.role)}
                </span>
                {!item.is_approved && (
                  <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center gap-1">
                    <ShieldAlert size={10} /> Pending
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
               {!item.is_approved && (
                 <button onClick={() => onApprove(item.id)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent text-white rounded-xl font-bold shadow-sm active:scale-95 transition-all"><CheckCircle size={16} /> Approve</button>
               )}
               <button onClick={() => onEdit(item)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-bg-secondary rounded-xl font-bold border border-border"><Edit size={16} /> Edit</button>
               <button onClick={() => onDelete(item.id)} className="flex-1 flex items-center justify-center gap-2 py-3 bg-bg-secondary text-red-500 rounded-xl font-bold border border-border"><Trash2 size={16} /> Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <table className="hidden sm:table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-bg-secondary/50">
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Name & Status</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Email</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Role</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Department / Academic</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {filteredUsers.map(item => (
            <tr key={item.id} className="hover:bg-bg-primary/30 transition-colors group">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-text-primary">{item.name}</span>
                  {!item.is_approved && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 text-[9px] font-black uppercase flex items-center gap-1 animate-pulse">
                      <ShieldAlert size={10} /> Pending Approval
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-text-secondary">
                   <Mail size={12} className="opacity-40" />
                   <span className="text-xs font-medium">{item.email}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                  item.role === 'ADMIN' 
                    ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                    : item.role === 'STUDENT_REP' 
                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                    : item.role === 'FACULTY'
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    : 'bg-bg-secondary text-text-secondary border-border'
                }`}>
                  {getRoleLabel(item.role)}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-text-primary">
                    {item.department_name || item.branch || 'General'}
                  </span>
                  {(item.role === 'STUDENT_REP' || item.role === 'VIEWER') && (
                    <span className="text-[10px] font-medium text-text-secondary uppercase">
                      {item.year ? `Year ${item.year}` : ''} {item.section ? `• Sec ${item.section}` : ''}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                   {!item.is_approved && (
                     <button 
                       onClick={() => onApprove(item.id)}
                       className="p-2 bg-accent text-white rounded-lg hover:opacity-90 transition-all shadow-sm flex items-center gap-1.5 px-3 text-[10px] font-black uppercase"
                     >
                       <CheckCircle size={14} /> Approve
                     </button>
                   )}
                   <button 
                     onClick={() => onEdit(item)}
                     className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-accent hover:border-accent/50 transition-all shadow-sm"
                   >
                     <Edit size={14} />
                   </button>
                   <button 
                     onClick={() => onDelete(item.id)}
                     className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-red-500 hover:border-red-500/50 transition-all shadow-sm"
                   >
                     <Trash2 size={14} />
                   </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminUsers;

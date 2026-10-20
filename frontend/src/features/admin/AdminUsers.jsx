import { Mail, UserX } from 'lucide-react';
import { getRoleLabel } from '../../utils/roleUtils';

const ROLE_BADGE = {
  ADMIN: 'bg-red-500/10 text-red-500 border-red-500/20',
  STUDENT_REP: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  FACULTY: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
};

const academicLabel = (u) => [
  u.branch,
  u.year ? `Year ${u.year}` : null,
  u.section ? `Sec ${u.section}` : null,
].filter(Boolean).join(' • ');

const isActive = (u) => u.is_active !== false;

function StatusBadge({ user }) {
  return isActive(user) ? (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-black capitalize border bg-green-500/10 text-green-600 border-green-500/20">Active</span>
  ) : (
    <span className="px-2 py-0.5 rounded-md text-[10px] font-black capitalize border bg-bg-secondary text-text-secondary border-border">Deactivated</span>
  );
}

function DeactivateButton({ user, onDeactivate, className }) {
  if (!isActive(user)) return null;
  return (
    <button onClick={() => onDeactivate(user)} aria-label={`Deactivate ${user.name}`} className={className}>
      <UserX size={14} /> Deactivate
    </button>
  );
}

/**
 * Read-only mirror of the institutional directory (the college ACL owns accounts, roles and
 * academic profile). The only CRAS-side action is deactivating someone.
 */
function AdminUsers({ users, searchTerm, onDeactivate }) {
  const term = searchTerm.toLowerCase();
  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(term) ||
    u.email.toLowerCase().includes(term)
  );

  if (filteredUsers.length === 0) {
    return <div className="p-20 text-center text-text-secondary capitalize font-black tracking-widest opacity-40">No users found</div>;
  }

  return (
    <div className="flex-1 overflow-auto no-scrollbar">
      <p className="px-6 pt-4 text-[11px] font-bold text-text-secondary">
        Accounts, roles and academic details come from the institutional directory and are read-only here.
      </p>

      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
        {filteredUsers.map(item => (
          <div key={item.id} className="bg-bg-primary p-5 rounded-2xl ring-1 ring-border/20 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-lg font-black text-text-primary leading-tight">{item.name}</span>
                <div className="flex items-center gap-1.5 text-text-secondary mt-1">
                  <Mail size={12} className="opacity-40" />
                  <span className="text-xs font-medium">{item.email}</span>
                </div>
                <span className="text-[11px] font-bold text-text-secondary mt-1">
                  {[item.department_name, academicLabel(item)].filter(Boolean).join(' · ') || 'General'}
                </span>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black capitalize border ${ROLE_BADGE[item.role] || 'bg-bg-secondary text-text-secondary border-border'}`}>
                  {getRoleLabel(item.role)}
                </span>
                <StatusBadge user={item} />
              </div>
            </div>
            <DeactivateButton
              user={item}
              onDeactivate={onDeactivate}
              className="w-full flex items-center justify-center gap-2 py-3 bg-bg-secondary text-red-500 rounded-xl font-bold border border-border"
            />
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <table className="hidden sm:table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/25 bg-surface-low/60 backdrop-blur-sm">
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">Name</th>
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">Email</th>
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">Role</th>
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">Branch / Year / Section</th>
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">Department</th>
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50">Status</th>
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/20">
          {filteredUsers.map((item, idx) => (
            <tr key={item.id} className={`hover:bg-surface-mid/60 transition-colors group ${idx % 2 === 0 ? 'row-alt' : ''}`}>
              <td className="px-6 py-4">
                <span className="text-sm font-black text-text-primary">{item.name}</span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-text-secondary">
                  <Mail size={12} className="opacity-40" />
                  <span className="text-xs font-medium">{item.email}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black capitalize tracking-wider border ${ROLE_BADGE[item.role] || 'bg-bg-secondary text-text-secondary border-border'}`}>
                  {getRoleLabel(item.role)}
                </span>
              </td>
              <td className="px-6 py-4 text-xs font-bold text-text-primary">{academicLabel(item) || '—'}</td>
              <td className="px-6 py-4 text-xs font-bold text-text-primary">{item.department_name || 'General'}</td>
              <td className="px-6 py-4"><StatusBadge user={item} /></td>
              <td className="px-6 py-4 text-right">
                <DeactivateButton
                  user={item}
                  onDeactivate={onDeactivate}
                  className="ml-auto p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-red-500 hover:border-red-500/50 transition-all shadow-sm flex items-center gap-1.5 px-3 text-[10px] font-black capitalize"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminUsers;

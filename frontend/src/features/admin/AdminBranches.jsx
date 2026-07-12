import React from 'react';
import { Edit, GitBranch, Trash2 } from 'lucide-react';

function AdminBranches({ branches, searchTerm, onEdit, onDelete }) {
  const matchingBranches = branches.filter((branch) =>
    [branch.name, branch.short_code, branch.department_name]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!matchingBranches.length) {
    return <div className="flex-1 flex items-center justify-center p-20 text-center text-text-secondary capitalize font-black tracking-widest opacity-40">No branches found</div>;
  }

  const actions = (branch) => (
    <div className="flex justify-end gap-2">
      <button onClick={() => onEdit(branch)} aria-label={`Edit ${branch.name}`} className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-accent hover:border-accent/50 transition-all shadow-sm"><Edit size={14} /></button>
      <button onClick={() => onDelete(branch.id)} aria-label={`Delete ${branch.name}`} className="p-2 bg-bg-primary border border-border text-text-secondary rounded-lg hover:text-red-500 hover:border-red-500/50 transition-all shadow-sm"><Trash2 size={14} /></button>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto no-scrollbar">
      <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
        {matchingBranches.map((branch) => (
          <div key={branch.id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2.5 rounded-xl"><GitBranch size={18} className="text-primary" /></div>
              <div><p className="text-lg font-black text-text-primary font-display">{branch.name}</p><p className="text-xs font-bold text-text-secondary">{branch.short_code || 'No code'} · {branch.department_name || 'No department'}</p></div>
            </div>
            {actions(branch)}
          </div>
        ))}
      </div>
      <table className="hidden sm:table w-full text-left border-collapse">
        <thead><tr className="border-b border-border/50 bg-bg-secondary/50">
          <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Branch</th>
          <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Code</th>
          <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Department</th>
          <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display text-right">Actions</th>
        </tr></thead>
        <tbody className="divide-y divide-border/30">{matchingBranches.map((branch) => (
          <tr key={branch.id} className="hover:bg-bg-primary/30 transition-colors">
            <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="bg-primary/5 p-1.5 rounded-lg"><GitBranch size={14} className="text-primary" /></div><span className="text-sm font-black text-text-primary font-display">{branch.name}</span></div></td>
            <td className="px-6 py-4 text-sm font-bold text-text-secondary">{branch.short_code || '—'}</td>
            <td className="px-6 py-4 text-sm font-bold text-text-secondary">{branch.department_name || '—'}</td>
            <td className="px-6 py-4">{actions(branch)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default AdminBranches;

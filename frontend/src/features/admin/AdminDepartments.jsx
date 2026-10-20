import React from 'react';
import { Layers } from 'lucide-react';

// Read-only: the college ACL owns departments (synced into CRAS); nothing is edited here.
function AdminDepartments({ departments, searchTerm }) {
  const filteredDepts = departments.filter(dept => 
    dept.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filteredDepts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
        <span className="text-text-secondary capitalize font-black tracking-widest opacity-40">No departments found</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto no-scrollbar">
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
        {filteredDepts.map(item => (
          <div key={item.id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2.5 rounded-xl">
                  <Layers size={18} className="text-primary" />
                </div>
                <span className="text-lg font-black text-text-primary leading-tight font-display capitalize">{item.name}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <table className="hidden sm:table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-bg-secondary/50">
            <th className="px-6 py-4 text-[10px] font-black capitalize tracking-widest text-text-secondary opacity-50 font-display">Department Name</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {filteredDepts.map(item => (
            <tr key={item.id} className="hover:bg-bg-primary/30 transition-colors group">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/5 p-1.5 rounded-lg opacity-80">
                    <Layers size={14} className="text-primary" />
                  </div>
                  <span className="text-sm font-black text-text-primary font-display capitalize">{item.name}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminDepartments;

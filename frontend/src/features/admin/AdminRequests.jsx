import { Check, X } from 'lucide-react';

function AdminRequests({ promotions, searchTerm, handlePromotionAction }) {
  const filteredRequests = promotions.filter(p => 
    p.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.user_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (filteredRequests.length === 0) {
    return <div className="p-20 text-center text-text-secondary uppercase font-black tracking-widest opacity-40">No pending requests</div>;
  }

  return (
    <div className="flex-1 overflow-auto no-scrollbar">
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
        {filteredRequests.map(item => (
          <div key={item.id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-lg font-black text-text-primary">{item.user_name}</span>
                <span className="text-xs font-medium text-text-secondary">{item.user_email}</span>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${
                item.status === 'APPROVED' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
              }`}>
                {item.status}
              </span>
            </div>
            <div className="bg-bg-secondary/50 p-3 rounded-xl border border-border">
              <p className="text-xs italic font-medium opacity-80">"{item.reason}"</p>
            </div>
            {item.status === 'PENDING' && (
              <div className="flex gap-2">
                 <button onClick={() => handlePromotionAction(item.id, 'APPROVED')} className="flex-1 py-3 bg-green-500 text-white rounded-xl font-black shadow-lg shadow-green-500/10">Approve</button>
                 <button onClick={() => handlePromotionAction(item.id, 'REJECTED')} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-black shadow-lg shadow-red-500/10">Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <table className="hidden sm:table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-bg-secondary/50">
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">User</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Reason</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Requested</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {filteredRequests.map(item => (
            <tr key={item.id} className="hover:bg-bg-primary/30 transition-colors group">
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-text-primary">{item.user_name}</span>
                  <span className="text-xs text-text-secondary opacity-70">{item.user_email}</span>
                </div>
              </td>
              <td className="px-6 py-4 max-w-xs">
                <p className="text-xs text-text-primary font-medium line-clamp-2 italic opacity-80">"{item.reason}"</p>
              </td>
              <td className="px-6 py-4">
                <span className="text-[10px] font-bold text-text-secondary uppercase">
                  {new Date(item.created_at).toLocaleDateString()}
                </span>
              </td>
              <td className="px-6 py-4">
                {item.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handlePromotionAction(item.id, 'APPROVED')}
                      className="p-2 bg-green-500 text-white rounded-lg hover:opacity-80 active:scale-95 transition-all shadow-sm"
                      title="Approve"
                    >
                      <Check size={16} />
                    </button>
                    <button 
                      onClick={() => handlePromotionAction(item.id, 'REJECTED')}
                      className="p-2 bg-red-500 text-white rounded-lg hover:opacity-80 active:scale-95 transition-all shadow-sm"
                      title="Reject"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${
                    item.status === 'APPROVED' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                  }`}>
                    {item.status}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminRequests;

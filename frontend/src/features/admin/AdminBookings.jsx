import { Clock, ArrowRight, Trash2 } from 'lucide-react';

function AdminBookings({ bookings, searchTerm, onCancel }) {
  const filteredBookings = bookings
    .filter(b => 
      b.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      b.room_name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  if (filteredBookings.length === 0) {
    return <div className="p-20 text-center text-text-secondary uppercase font-black tracking-widest opacity-40">No bookings found</div>;
  }

  return (
    <div className="flex-1 overflow-auto no-scrollbar">
      {/* Mobile Card View */}
      <div className="grid grid-cols-1 gap-4 p-4 sm:hidden">
        {filteredBookings.map(item => (
          <div key={item.id} className="bg-bg-primary p-5 rounded-2xl border border-border shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <span className="text-lg font-black text-text-primary">{item.room_name}</span>
                <span className="text-sm font-bold text-text-secondary">{item.user_name}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${
                item.status === 'ACTIVE' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
              }`}>
                {item.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-text-secondary bg-bg-secondary p-3 rounded-xl border border-border">
              <Clock size={16} />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-text-primary">
                  {new Date(item.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span className="text-[10px] font-medium opacity-60">
                  {new Date(item.start_time).getHours().toString().padStart(2, '0')}:00 - {(new Date(item.start_time).getHours() + 1).toString().padStart(2, '0')}:00
                </span>
              </div>
            </div>
            {item.status === 'ACTIVE' && (
              <button
                onClick={() => onCancel(item.id)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-bold border border-red-100"
              >
                <Trash2 size={16} /> Cancel Allocation
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Desktop Table View */}
      <table className="hidden sm:table w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-bg-secondary/50">
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Member</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Room</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Time Slot</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50">Status</th>
            <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary opacity-50 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {filteredBookings.map(item => (
            <tr key={item.id} className="hover:bg-bg-primary/30 transition-colors group">
              <td className="px-6 py-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-text-primary">{item.user_name}</span>
                  <span className="text-[10px] text-text-secondary opacity-70 font-bold uppercase tracking-wider">{item.department_name || item.branch || 'General'}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="text-sm font-black text-accent bg-accent/5 px-2 py-1 rounded-lg border border-accent/10">{item.room_name}</span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-text-primary">
                  <Clock size={14} className="text-text-secondary opacity-40" />
                  <span className="text-xs font-bold whitespace-nowrap">
                    {new Date(item.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <ArrowRight size={12} className="text-text-secondary opacity-20" />
                  <span className="text-xs font-black bg-bg-secondary px-1.5 py-0.5 rounded border border-border">
                    {new Date(item.start_time).getHours().toString().padStart(2, '0')}:00
                  </span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-sm border ${
                  item.status === 'ACTIVE' 
                    ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                }`}>
                  {item.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                {item.status === 'ACTIVE' && (
                  <button
                    onClick={() => onCancel(item.id)}
                    className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Cancel Booking"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminBookings;

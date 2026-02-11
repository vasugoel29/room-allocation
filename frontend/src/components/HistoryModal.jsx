import React from 'react';
import { X, Clock, User, Hash, Info } from 'lucide-react';

const HistoryModal = ({ bookings, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl glass rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in duration-300">
        {/* Header */}
        <div className="p-8 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Booking History</h2>
            <p className="text-slate-400 text-sm">Review all room reservations and details.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {bookings.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex p-4 bg-white/5 rounded-2xl text-slate-500 mb-4">
                <Clock size={40} />
              </div>
              <p className="text-slate-400">No booking records found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-500 text-xs uppercase tracking-wider font-semibold">
                    <th className="pb-4 px-4">Room</th>
                    <th className="pb-4 px-4">Time</th>
                    <th className="pb-4 px-4">Booked By</th>
                    <th className="pb-4 px-4">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-4 font-medium text-white">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                            <Hash size={16} />
                          </div>
                          {booking.room_name}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-300">
                        {new Date(booking.start_time).toLocaleDateString()} at {new Date(booking.start_time).getHours()}:00
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2 text-indigo-400">
                          <User size={14} />
                          {booking.user_name}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-400 italic">
                        "{booking.purpose || 'No purpose provided'}"
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 bg-white/[0.02] border-t border-white/10 flex justify-end items-center gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium text-white transition-all border border-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoryModal;

import { X, AlertTriangle } from 'lucide-react';

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmType = 'danger' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-bg-primary w-full max-w-sm rounded-[2rem] shadow-2xl border border-border overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-border flex justify-between items-center bg-bg-secondary/30">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${confirmType === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-accent/10 text-accent'}`}>
               <AlertTriangle size={24} />
            </div>
            <h2 className="text-xl font-black text-text-primary capitalize">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-secondary rounded-xl transition-colors">
            <X size={20} className="text-text-secondary" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-sm font-medium text-text-secondary leading-relaxed">
            {message}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-border rounded-xl font-bold text-sm hover:bg-bg-secondary text-text-primary transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-[1.5] px-4 py-3 text-white rounded-xl font-black text-sm shadow-lg transition-all active:scale-95 ${
                confirmType === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-500/10' : 'bg-accent hover:opacity-90 shadow-accent/20'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;

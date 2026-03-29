import { X, AlertTriangle } from 'lucide-react';

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', confirmType = 'danger' }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-surface-lowest/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
      <div className="bg-surface-low w-full max-w-sm rounded-[2.5rem] shadow-ambient overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8 pb-4 flex justify-between items-center bg-tonal-secondary/5 font-display">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${confirmType === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary shadow-ambient'}`}>
               <AlertTriangle size={24} strokeWidth={2.5} />
            </div>
            <h2 className="text-xl font-extrabold text-text-primary tracking-tight uppercase">{title}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-text-secondary hover:text-text-primary transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-8 pt-4 space-y-8">
          <p className="text-sm font-bold text-text-secondary leading-relaxed uppercase tracking-wider opacity-60 font-display">
            {message}
          </p>
          <div className="flex gap-4 font-display">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-4 bg-tonal-secondary/10 rounded-2xl font-extrabold text-[10px] uppercase tracking-widest text-text-primary hover:bg-tonal-secondary/20 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`flex-[1.5] px-4 py-4 text-white rounded-2xl font-extrabold text-[10px] uppercase tracking-widest shadow-ambient transition-all active:scale-95 ${
                confirmType === 'danger' ? 'bg-red-500' : 'bg-primary'
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

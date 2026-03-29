import React from 'react';
import { X } from 'lucide-react';
import HistoryView from '../../features/history/HistoryView';

const HistoryModal = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-4xl glass dark:bg-slate-800 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in duration-300 border border-black/5">
        <HistoryView onClose={onClose} />
      </div>
    </div>
  );
};

export default HistoryModal;

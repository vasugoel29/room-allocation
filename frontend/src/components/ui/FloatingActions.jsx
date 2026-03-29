import React from 'react';
import { Filter } from 'lucide-react';

const FloatingActions = ({ onSearchClick }) => {
  return (
    <div className="fixed bottom-24 right-5 flex flex-col items-end gap-3 z-50 lg:hidden">
      <button
        onClick={onSearchClick}
        className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xl transition-all active:scale-90 flex items-center justify-center border border-white/10 dark:border-black/5"
      >
        <Filter size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default FloatingActions;

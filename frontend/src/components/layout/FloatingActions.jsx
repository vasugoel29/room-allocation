import React from 'react';
import { Filter } from 'lucide-react';

const FloatingActions = ({ onSearchClick }) => {
  return (
    <div className="fixed bottom-28 right-6 flex flex-col items-end gap-3 z-50 lg:hidden">
      <button
        onClick={onSearchClick}
        className="w-16 h-16 rounded-full bg-primary-accent text-white shadow-ambient transition-all active:scale-95 flex items-center justify-center"
      >
        <Filter size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default FloatingActions;

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import HistoryView from '../features/history/HistoryView';

function MobileHistory({ onBack }) {
  return (
    <div className="flex flex-col h-full w-full bg-surface-lowest fixed inset-0 z-[60]">
      <div className="p-4 flex items-center gap-4 bg-surface-low/50 backdrop-blur-md">
        <button onClick={onBack} className="p-2 rounded-full text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-extrabold text-text-primary uppercase tracking-tight font-display">My Bookings</h1>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <HistoryView />
      </div>
    </div>
  );
}

export default MobileHistory;

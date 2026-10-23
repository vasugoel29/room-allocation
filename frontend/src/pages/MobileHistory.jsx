import React from 'react';
import { ArrowLeft } from 'lucide-react';
import HistoryView from '../features/history/HistoryView';

function MobileHistory({ onBack }) {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="pb-3 flex items-center gap-3 border-b border-border/10">
        <button onClick={onBack} className="p-2 -ml-1 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-highest/10 transition-colors" title="Back to Calendar">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-extrabold text-text-primary capitalize tracking-tight font-display">My Bookings</h1>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <HistoryView />
      </div>
    </div>
  );
}

export default MobileHistory;

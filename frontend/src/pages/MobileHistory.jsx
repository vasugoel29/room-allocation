import React from 'react';
import { ArrowLeft } from 'lucide-react';
import HistoryView from '../features/history/HistoryView';

function MobileHistory({ onBack }) {
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary fixed inset-0 z-[60]">
      <div className="p-4 border-b border-border flex items-center gap-4 bg-bg-secondary/30">
        <button onClick={onBack} className="p-2 hover:bg-black/5 rounded-full text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-text-primary">My Bookings</h1>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <HistoryView />
      </div>
    </div>
  );
}

export default MobileHistory;

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import HistoryView from '../features/history/HistoryView';

function MobileHistory() {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1 overflow-hidden relative">
        <HistoryView />
      </div>
    </div>
  );
}

export default MobileHistory;

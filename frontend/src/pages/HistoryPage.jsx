import React from 'react';
import { AppContext } from '../context/AppContext';
import HistoryModal from '../components/modals/HistoryModal';
import { ArrowLeft } from 'lucide-react';

function HistoryPage({ onBack }) {
  return (
    <div className="flex flex-col h-full w-full bg-bg-primary">
      <div className="p-4 border-b border-border flex items-center gap-4 bg-bg-secondary/30">
        <button onClick={onBack} className="p-2 hover:bg-black/5 rounded-full text-text-secondary">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-bold text-text-primary">My Bookings</h1>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {/* We reuse the HistoryModal content but we need to strip its fixed/backdrop wrapper if we want it to blend in */}
        {/* For now, I'll create a modified version of HistoryModal or just use it as is if I can control the wrapper */}
        <HistoryPageContent />
      </div>
    </div>
  );
}

// Extracting content from HistoryModal into a reusable component would be better.
// I'll create a new file for the content.
export default HistoryPage;

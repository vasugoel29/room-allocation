import React from 'react';
import HistoryView from '../features/history/HistoryView';

/**
 * Full page wrapper for the Bookings history and transfers
 */
function Bookings() {
  return (
    <div className="w-full h-full overflow-hidden flex flex-col no-scrollbar">
      <HistoryView />
    </div>
  );
}

export default Bookings;

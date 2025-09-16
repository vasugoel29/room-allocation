import React, { useState } from 'react';
import ScheduleOptionForm from './ScheduleOptionForm';
import db from '../db.json';

const { days, slots, rooms } = db;

const ScheduleOption = () => {
  const [mode, setMode] = useState(null); // 'schedule' or 'reschedule'
  const [previousSlot, setPreviousSlot] = useState(null);

  const handleRescheduleClick = () => {
    setMode('reschedule');
    setPreviousSlot({ day: 'Mon', slot: 'T3' }); // Example previous slot, can be dynamic
  };

  const handleScheduleClick = () => {
    setMode('schedule');
    setPreviousSlot(null);
  };

  const handleCancel = () => {
    setMode(null);
    setPreviousSlot(null);
  };

  if (mode === 'schedule') {
    // Render ScheduleOptionForm in schedule mode
    return (
      <ScheduleOptionForm
        mode="schedule"
        onCancel={handleCancel}
        includePreferredDay={true}
        days={days}
        slots={slots}
        rooms={rooms}
      />
    );
  }
  if (mode === 'reschedule') {
    // Render ScheduleOptionForm in reschedule mode, passing previousSlot
    return (
      <ScheduleOptionForm
        mode="reschedule"
        previousSlot={previousSlot}
        onCancel={handleCancel}
        includePreferredDay={true}
        days={days}
        slots={slots}
        rooms={rooms}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white space-y-4">
      <button
        onClick={handleScheduleClick}
        className="px-6 py-3 bg-green-600 rounded hover:bg-green-700"
      >
        Schedule Class
      </button>
      <button
        onClick={handleRescheduleClick}
        className="px-6 py-3 bg-blue-600 rounded hover:bg-blue-700"
      >
        Reschedule Class
      </button>
    </div>
  );
};

export default ScheduleOption;
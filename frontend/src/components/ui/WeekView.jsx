import React from 'react';
import { Clock } from 'lucide-react';

/**
 * WeekView — shared week-view timetable grid.
 * Days as rows, slots flow horizontally.
 */
export const WeekView = ({
  weeklySchedule = {},
  accentColor = 'accent', // 'accent' | 'primary'
  getSubject = (item) => item.subjectName || item.subject,
  renderSlotSubtitle = null,
  renderSlotActions = null
}) => {
  // Map class name strings based on accentColor
  const textAccentClass = accentColor === 'primary' ? 'text-primary' : 'text-accent';
  const bgAccent15Class = accentColor === 'primary' ? 'bg-primary/15' : 'bg-accent/15';
  const borderAccent40Class = accentColor === 'primary' ? 'border-primary/40' : 'border-accent/40';
  const borderAccent30Class = accentColor === 'primary' ? 'border-primary/30' : 'border-accent/30';

  return (
    <div className="rounded-2xl overflow-hidden border border-surface-mid">
      {Object.entries(weeklySchedule).map(([dayName, dayInfo], rowIdx) => (
        <div key={dayName} className={`flex items-stretch min-h-[96px] border-b border-surface-mid last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-surface-low' : 'bg-surface-mid'}`}>
          {/* Day Label */}
          <div className="w-24 shrink-0 flex flex-col items-center justify-center py-4 border-r border-surface-mid">
            <p className={`text-xs font-black uppercase tracking-widest ${textAccentClass}`}>{dayName.slice(0, 3)}</p>
            <p className="text-[10px] text-text-secondary font-bold mt-1">
              {new Date(dayInfo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          {/* Slots Row — scrolls horizontally only */}
          <div className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden no-scrollbar px-4 py-3 items-stretch">
            {dayInfo.slots.length > 0 ? (
              dayInfo.slots.map((item, index) => (
                <div
                  key={index}
                  className={`shrink-0 w-52 flex flex-col justify-between rounded-2xl px-4 py-3 border transition-all ${
                    item.isDynamic
                      ? `${bgAccent15Class} ${borderAccent40Class}`
                      : 'bg-surface-high border-surface-highest'
                  }`}
                >
                  <div>
                    <p className="text-xs font-black text-text-primary leading-snug">{getSubject(item)}</p>
                    {renderSlotSubtitle && renderSlotSubtitle(item)}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-[10px] text-text-secondary font-bold flex items-center gap-1">
                      <Clock size={10} className={`${textAccentClass} shrink-0`} /> {item.displayTime}
                    </span>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${textAccentClass} ${bgAccent15Class} ${borderAccent30Class}`}>
                      {item.room}
                    </span>
                  </div>
                  {renderSlotActions && renderSlotActions(item)}
                </div>
              ))
            ) : (
              <div className="flex items-center text-text-secondary/40 text-xs font-bold uppercase tracking-widest">
                No classes
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default WeekView;

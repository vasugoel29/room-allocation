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
    <div className="rounded-2xl overflow-hidden border border-border-subtle bg-surface-low shadow-sm">
      {Object.entries(weeklySchedule).map(([dayName, dayInfo], rowIdx) => (
        <div key={dayName} className={`flex items-stretch min-h-[88px] sm:min-h-[96px] border-b border-border-subtle last:border-b-0 ${rowIdx % 2 === 0 ? 'bg-surface-low' : 'bg-surface-lowest'}`}>
          {/* Day Label */}
          <div className="w-16 sm:w-20 shrink-0 flex flex-col items-center justify-center py-3 border-r border-border-subtle px-1 select-none">
            <p className={`text-[11px] sm:text-xs font-black capitalize tracking-wider ${textAccentClass}`}>{dayName.slice(0, 3)}</p>
            <p className="text-[9px] sm:text-[10px] text-text-secondary font-bold mt-0.5 text-center leading-tight">
              {new Date(dayInfo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          {/* Slots Row — snappy horizontal scrolling */}
          <div className="flex-1 flex gap-2.5 overflow-x-auto overflow-y-hidden no-scrollbar px-3 sm:px-4 py-2.5 items-stretch snap-scroll-x scroll-smooth overscroll-x-contain">
            {dayInfo.slots.length > 0 ? (
              dayInfo.slots.map((item, index) => (
                <div
                  key={index}
                  className={`shrink-0 w-44 sm:w-52 snap-start flex flex-col justify-between rounded-xl px-3.5 py-2.5 border transition-all shadow-sm ${
                    item.isDynamic
                      ? `${bgAccent15Class} ${borderAccent40Class}`
                      : 'bg-surface-high/60 border-border-subtle hover:bg-surface-high'
                  }`}
                >
                  <div>
                    <p className="text-xs font-black text-text-primary leading-snug line-clamp-2">{getSubject(item)}</p>
                    {renderSlotSubtitle && renderSlotSubtitle(item)}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-[10px] text-text-secondary font-bold flex items-center gap-1">
                      <Clock size={10} className={`${textAccentClass} shrink-0`} /> {item.displayTime}
                    </span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${textAccentClass} ${bgAccent15Class} ${borderAccent30Class}`}>
                      {item.room}
                    </span>
                  </div>
                  {renderSlotActions && renderSlotActions(item)}
                </div>
              ))
            ) : (
              <div className="flex items-center text-text-secondary/40 text-[11px] font-bold capitalize tracking-wider pl-2">
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

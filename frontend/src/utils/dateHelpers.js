/**
 * Smart date utility for room allocation logic.
 * Handles "Next Working Day" logic and standard date ranges.
 */

export const getSmartTodayDate = (now = new Date()) => {
  const day = now.getDay();
  const hour = now.getHours();
  const targetDate = new Date(now);

  // If Sunday (0), go to Monday
  if (day === 0) targetDate.setDate(now.getDate() + 1);
  // If Saturday (6), go to Monday
  else if (day === 6) targetDate.setDate(now.getDate() + 2);
  // If after 6 PM, go to next working day
  else if (hour >= 18) {
    // If Friday evening, go to Monday
    if (day === 5) targetDate.setDate(now.getDate() + 3);
    else targetDate.setDate(now.getDate() + 1);
  }

  return targetDate;
};

export const getTodayRange = (now = new Date()) => {
  const targetDate = getSmartTodayDate(now);
  
  const start = new Date(targetDate);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(targetDate);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

export const getWeekRange = (now = new Date()) => {
  const currentDay = now.getDay() || 7; // Treat Sunday as 7
  const offset = currentDay >= 6 ? 7 : 0; // If weekend, look at next week
  
  const monday = new Date(now);
  monday.setDate(now.getDate() - currentDay + 1 + offset);
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: sunday };
};

export const formatRangeToISO = ({ start, end }) => ({
  start: start.toISOString(),
  end: end.toISOString()
});

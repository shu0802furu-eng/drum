function toUtcDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  totalDays: number;
}

/**
 * `recordedDates` may contain duplicates (multiple videos on the same day) and
 * doesn't need to be sorted. `todayStr` is the yyyy-mm-dd to measure the current
 * streak from (injected rather than read from `Date.now()` so this is testable).
 */
export function computeStreakStats(recordedDates: string[], todayStr: string): StreakStats {
  const uniqueDays = Array.from(new Set(recordedDates))
    .map(toUtcDayNumber)
    .sort((a, b) => a - b);
  const totalDays = uniqueDays.length;
  if (totalDays === 0) {
    return { currentStreak: 0, longestStreak: 0, totalDays: 0 };
  }

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    run = uniqueDays[i] === uniqueDays[i - 1] + 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const daySet = new Set(uniqueDays);
  const today = toUtcDayNumber(todayStr);
  // A day's grace: practicing yesterday (but not yet today) still counts as an active streak.
  let cursor = daySet.has(today) ? today : today - 1;
  if (!daySet.has(cursor)) {
    return { currentStreak: 0, longestStreak, totalDays };
  }
  let currentStreak = 0;
  while (daySet.has(cursor)) {
    currentStreak += 1;
    cursor -= 1;
  }
  return { currentStreak, longestStreak, totalDays };
}

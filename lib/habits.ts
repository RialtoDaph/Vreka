import { localDateKey } from "./date";

export function computeStreak(periods: Set<string>): number {
  const d = new Date();
  if (!periods.has(localDateKey(d))) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  while (periods.has(localDateKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function computeStreak(periods: Set<string>): number {
  const d = new Date();
  if (!periods.has(d.toISOString().slice(0, 10))) {
    d.setDate(d.getDate() - 1);
  }
  let streak = 0;
  while (periods.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

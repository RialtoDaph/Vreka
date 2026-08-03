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

// Oldest-first checked/unchecked flags for the last `days` days (today
// inclusive) -- the cell grid a heatmap renders straight from, index 0 is
// the oldest day and the last index is today.
export function buildHeatmapCells(periods: Set<string>, days: number): boolean[] {
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  const cells: boolean[] = [];
  for (let i = 0; i < days; i++) {
    cells.push(periods.has(localDateKey(d)));
    d.setDate(d.getDate() + 1);
  }
  return cells;
}

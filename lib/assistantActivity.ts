import { localDateKey } from "./date";

export type ToolBreakdownEntry = { tool_name: string; count: number };

export function buildToolBreakdown(logs: { tool_name: string }[], top = 6): ToolBreakdownEntry[] {
  const counts = new Map<string, number>();
  for (const l of logs) counts.set(l.tool_name, (counts.get(l.tool_name) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([tool_name, count]) => ({ tool_name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

export type DailyActivityPoint = { key: string; label: string; count: number };

// Oldest-first, today inclusive -- same convention as buildHeatmapCells in
// lib/habits.ts, just counting instead of a checked/unchecked flag.
export function buildDailyActivity(logs: { created_at: string }[], days: number): DailyActivityPoint[] {
  const counts = new Map<string, number>();
  for (const l of logs) {
    const key = localDateKey(new Date(l.created_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  const points: DailyActivityPoint[] = [];
  for (let i = 0; i < days; i++) {
    const key = localDateKey(d);
    points.push({
      key,
      label: new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(d),
      count: counts.get(key) ?? 0,
    });
    d.setDate(d.getDate() + 1);
  }
  return points;
}

import { localDateKey } from "./date";

// Re-exported so existing importers (`@/lib/calendarGrid`) keep working --
// this used to be `d.toISOString().slice(0, 10)`, which returns the UTC
// calendar day instead of the day actually shown in the grid cell for any
// positive-UTC-offset user. See lib/date.ts.
export const dateKey = localDateKey;

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// 42 dates (6 Sunday-start weeks) covering the full grid view for the month
// containing `monthDate`, including the leading/trailing days borrowed from
// the adjacent months needed to fill whole weeks.
export function buildMonthGrid(monthDate: Date): Date[] {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - startWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

// The 7 dates (Sunday through Saturday) of the week containing `anyDayInWeek`
// -- same Sunday-start convention as buildMonthGrid, just one week instead
// of the padded 6-week block.
export function buildWeekGrid(anyDayInWeek: Date): Date[] {
  const startWeekday = anyDayInWeek.getDay(); // 0 = Sunday
  const gridStart = new Date(anyDayInWeek.getFullYear(), anyDayInWeek.getMonth(), anyDayInWeek.getDate());
  gridStart.setDate(gridStart.getDate() - startWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

// Local-timezone-safe "what day/month is it" helpers.
//
// `Date#toISOString()` always renders the UTC calendar date. For any
// positive-UTC-offset user (all of Indonesia, UTC+7/+8/+9) that's wrong for
// several hours around local midnight -- e.g. checking a habit at 00:30 WIB
// stores it under the previous UTC day. These build the key from the Date
// object's own local getters instead, so they always match the wall-clock
// day the browser/server process is actually in.

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return localDateKey(new Date());
}

export function localMonthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function currentMonthKey(): string {
  return localMonthKey(new Date());
}

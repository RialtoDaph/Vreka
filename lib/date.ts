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

// Value for a <input type="datetime-local"> field (`YYYY-MM-DDTHH:mm`),
// read off the Date object's own local getters -- same local-timezone-safe
// reasoning as the keys above, just down to the minute.
export function localDateTimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${localDateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Combines a "YYYY-MM-DD" date and "HH:mm" time (e.g. two separate form
// fields) into a Date built from local components -- not by parsing a
// combined string, which is what was silently producing UTC-ambiguous
// datetimes before.
export function localDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

// Google Calendar (and similar APIs) want an explicit UTC offset on a
// dateTime string; without one it's ambiguous which timezone the event is
// actually in.
export function toIsoWithLocalOffset(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${localDateTimeValue(d)}:00${sign}${offH}:${offM}`;
}

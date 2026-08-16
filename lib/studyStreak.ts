import { localDateKey } from "@/lib/date";

// Counts consecutive days of learning activity (a logged study session or a
// flashcard review) ending today -- if nothing happened yet today the
// streak isn't broken until the day actually ends, so studying tomorrow
// morning still continues yesterday's streak.
export function computeStreak(activityDates: (string | null | undefined)[], today: Date = new Date()): number {
  const days = new Set(activityDates.filter((d): d is string => !!d).map((d) => localDateKey(new Date(d))));

  const cursor = new Date(today);
  if (!days.has(localDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (days.has(localDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

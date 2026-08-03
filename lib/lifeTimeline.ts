import { THEME } from "./theme";
import type { MilestoneCategory } from "./types";

export type TimelineCategory = MilestoneCategory | "otomatis";

export const MILESTONE_CATEGORY_META: Record<TimelineCategory, { label: string; color: string }> = {
  pendidikan: { label: "Pendidikan", color: THEME.cyanGlow },
  karier: { label: "Karier", color: THEME.violetGlow },
  keluarga: { label: "Keluarga", color: THEME.mintGlow },
  lainnya: { label: "Lainnya", color: THEME.neutral400 },
  otomatis: { label: "Otomatis", color: THEME.amberGlow },
};

export type LifeTimelineEntry = {
  id: string;
  title: string;
  occurred_on: string;
  category: TimelineCategory;
  description: string | null;
  auto: boolean;
};

export function deriveStudyMilestones(
  notes: { id: string; title: string; progress: number; updated_at: string }[]
): LifeTimelineEntry[] {
  return notes
    .filter((n) => n.progress === 100)
    .map((n) => ({
      id: `study-${n.id}`,
      title: `Topik "${n.title}" selesai 100%`,
      occurred_on: n.updated_at.slice(0, 10),
      category: "otomatis" as const,
      description: null,
      auto: true,
    }));
}

const STREAK_THRESHOLDS = [7, 30, 100];

// Flags the date a habit's running streak *first ever* crosses each
// threshold -- a one-time personal record, not re-fired every time a later
// streak happens to pass the same length again.
export function deriveHabitStreakMilestones(
  habitId: string,
  habitTitle: string,
  periods: string[]
): LifeTimelineEntry[] {
  const sorted = Array.from(new Set(periods)).sort();
  const entries: LifeTimelineEntry[] = [];
  let streak = 0;
  let prevTime: number | null = null;
  let thresholdIdx = 0;
  for (const p of sorted) {
    const t = new Date(`${p}T00:00:00`).getTime();
    streak = prevTime !== null && Math.round((t - prevTime) / 86400000) === 1 ? streak + 1 : 1;
    prevTime = t;
    while (thresholdIdx < STREAK_THRESHOLDS.length && streak >= STREAK_THRESHOLDS[thresholdIdx]) {
      const days = STREAK_THRESHOLDS[thresholdIdx];
      entries.push({
        id: `habit-${habitId}-${days}`,
        title: `Streak "${habitTitle}" ${days} hari`,
        occurred_on: p,
        category: "otomatis",
        description: null,
        auto: true,
      });
      thresholdIdx++;
    }
  }
  return entries;
}

export function splitByStartDate(
  entries: LifeTimelineEntry[],
  startDate: string
): { before: LifeTimelineEntry[]; since: LifeTimelineEntry[] } {
  const sorted = [...entries].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  return {
    before: sorted.filter((e) => e.occurred_on < startDate),
    since: sorted.filter((e) => e.occurred_on >= startDate),
  };
}

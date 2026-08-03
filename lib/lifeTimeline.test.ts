import { describe, expect, it } from "vitest";
import { deriveHabitStreakMilestones, deriveStudyMilestones, splitByStartDate } from "./lifeTimeline";

describe("deriveStudyMilestones", () => {
  it("only includes notes at 100% progress", () => {
    const entries = deriveStudyMilestones([
      { id: "n1", title: "Kalkulus II", progress: 100, updated_at: "2026-02-03T10:00:00Z" },
      { id: "n2", title: "Bahasa Inggris", progress: 60, updated_at: "2026-02-01T10:00:00Z" },
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      title: 'Topik "Kalkulus II" selesai 100%',
      occurred_on: "2026-02-03",
      category: "otomatis",
      auto: true,
    });
  });
});

describe("deriveHabitStreakMilestones", () => {
  function consecutiveDays(start: string, count: number): string[] {
    const days: string[] = [];
    const d = new Date(`${start}T00:00:00`);
    for (let i = 0; i < count; i++) {
      days.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }

  it("fires a 7-day milestone on the 7th consecutive day", () => {
    const entries = deriveHabitStreakMilestones("h1", "Olahraga", consecutiveDays("2026-01-01", 7));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'Streak "Olahraga" 7 hari', occurred_on: "2026-01-07" });
  });

  it("fires every threshold crossed by a single long streak", () => {
    const entries = deriveHabitStreakMilestones("h1", "Olahraga", consecutiveDays("2026-01-01", 30));
    expect(entries.map((e) => e.title)).toEqual(['Streak "Olahraga" 7 hari', 'Streak "Olahraga" 30 hari']);
  });

  it("resets the running streak after a gap", () => {
    const days = [...consecutiveDays("2026-01-01", 5), ...consecutiveDays("2026-02-01", 5)];
    const entries = deriveHabitStreakMilestones("h1", "Baca buku", days);
    expect(entries).toHaveLength(0);
  });

  it("does not re-fire a threshold already crossed once a later streak recrosses it", () => {
    const days = [...consecutiveDays("2026-01-01", 7), ...consecutiveDays("2026-02-01", 7)];
    const entries = deriveHabitStreakMilestones("h1", "Baca buku", days);
    expect(entries).toHaveLength(1);
    expect(entries[0].occurred_on).toBe("2026-01-07");
  });
});

describe("splitByStartDate", () => {
  it("sorts and splits entries at the given start date, boundary inclusive on 'since'", () => {
    const entries = [
      { id: "a", title: "A", occurred_on: "2020-01-01", category: "pendidikan" as const, description: null, auto: false },
      { id: "b", title: "B", occurred_on: "2026-01-15", category: "karier" as const, description: null, auto: false },
      { id: "c", title: "C", occurred_on: "2015-06-01", category: "pendidikan" as const, description: null, auto: false },
    ];
    const { before, since } = splitByStartDate(entries, "2026-01-15");
    expect(before.map((e) => e.id)).toEqual(["c", "a"]);
    expect(since.map((e) => e.id)).toEqual(["b"]);
  });
});

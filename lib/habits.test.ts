import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHeatmapCells, computeStreak } from "./habits";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const originalTZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTZ;
  vi.useRealTimers();
});

describe("computeStreak", () => {
  it("returns 0 for no checks at all", () => {
    expect(computeStreak(new Set())).toBe(0);
  });

  it("counts today alone as a streak of 1", () => {
    expect(computeStreak(new Set([daysAgo(0)]))).toBe(1);
  });

  it("counts consecutive days including today", () => {
    expect(computeStreak(new Set([daysAgo(0), daysAgo(1), daysAgo(2)]))).toBe(3);
  });

  it("still shows the streak from yesterday when today isn't checked yet", () => {
    expect(computeStreak(new Set([daysAgo(1), daysAgo(2), daysAgo(3)]))).toBe(3);
  });

  it("stops counting at a gap", () => {
    expect(computeStreak(new Set([daysAgo(0), daysAgo(1), daysAgo(3)]))).toBe(2);
  });

  it("resets to 0 when neither today nor yesterday is checked, even with older checks", () => {
    expect(computeStreak(new Set([daysAgo(3), daysAgo(4)]))).toBe(0);
  });

  describe("timezone safety", () => {
    const WIB_TZ = "Asia/Jakarta"; // UTC+7
    // 17:30 UTC on Aug 1 is already 00:30 WIB on Aug 2 -- a new day locally.
    const NOW = new Date("2026-08-01T17:30:00Z");

    it("counts a habit checked right after local midnight as today's check", () => {
      process.env.TZ = WIB_TZ;
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      expect(computeStreak(new Set(["2026-08-02"]))).toBe(1);
    });

    it("regression: the old UTC-based implementation would have missed it", () => {
      process.env.TZ = WIB_TZ;
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      // Re-implements the pre-fix logic (`toISOString().slice(0, 10)`
      // instead of a local-timezone key) against the exact same input as
      // the test above, to prove *why* the old code was wrong, not just
      // that the new code is right.
      function oldBuggyStreak(periods: Set<string>): number {
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

      expect(oldBuggyStreak(new Set(["2026-08-02"]))).toBe(0);
    });

    it("chains a streak across local day boundaries near UTC midnight", () => {
      process.env.TZ = WIB_TZ;
      vi.useFakeTimers();
      vi.setSystemTime(NOW);

      expect(computeStreak(new Set(["2026-08-02", "2026-08-01", "2026-07-31"]))).toBe(3);
    });
  });
});

describe("buildHeatmapCells", () => {
  it("returns `days` cells, oldest first, today last", () => {
    const cells = buildHeatmapCells(new Set([daysAgo(0)]), 7);
    expect(cells).toHaveLength(7);
    expect(cells).toEqual([false, false, false, false, false, false, true]);
  });

  it("marks every day false for an empty check set", () => {
    expect(buildHeatmapCells(new Set(), 30)).toEqual(Array(30).fill(false));
  });

  it("marks every day true when the whole range was checked", () => {
    const periods = new Set(Array.from({ length: 7 }, (_, i) => daysAgo(i)));
    expect(buildHeatmapCells(periods, 7)).toEqual(Array(7).fill(true));
  });

  it("places a mid-range check at the right index", () => {
    // 7-day window, oldest-first: index 3 is 3 days before today.
    const cells = buildHeatmapCells(new Set([daysAgo(3)]), 7);
    expect(cells).toEqual([false, false, false, true, false, false, false]);
  });

  it("supports a 30-day window", () => {
    const cells = buildHeatmapCells(new Set([daysAgo(29), daysAgo(0)]), 30);
    expect(cells).toHaveLength(30);
    expect(cells[0]).toBe(true);
    expect(cells[29]).toBe(true);
    expect(cells.slice(1, 29).every((c) => c === false)).toBe(true);
  });

  it("stays timezone-safe across a UTC day boundary (same WIB regression as computeStreak)", () => {
    process.env.TZ = "Asia/Jakarta";
    vi.useFakeTimers();
    // 17:30 UTC on Aug 1 is already 00:30 WIB on Aug 2.
    vi.setSystemTime(new Date("2026-08-01T17:30:00Z"));

    const cells = buildHeatmapCells(new Set(["2026-08-02"]), 7);
    expect(cells[6]).toBe(true); // today (local) is checked
  });
});

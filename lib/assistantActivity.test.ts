import { describe, expect, it } from "vitest";
import { buildDailyActivity, buildToolBreakdown } from "./assistantActivity";
import { localDateKey } from "./date";

describe("buildToolBreakdown", () => {
  it("counts occurrences per tool and sorts descending", () => {
    const logs = [
      { tool_name: "add_transaction" },
      { tool_name: "remember" },
      { tool_name: "add_transaction" },
      { tool_name: "remember" },
      { tool_name: "add_transaction" },
    ];
    expect(buildToolBreakdown(logs)).toEqual([
      { tool_name: "add_transaction", count: 3 },
      { tool_name: "remember", count: 2 },
    ]);
  });

  it("caps the result at `top` entries", () => {
    const logs = ["a", "b", "c", "d"].map((tool_name) => ({ tool_name }));
    expect(buildToolBreakdown(logs, 2)).toHaveLength(2);
  });
});

describe("buildDailyActivity", () => {
  it("returns `days` points ending today, oldest first", () => {
    const points = buildDailyActivity([], 14);
    expect(points).toHaveLength(14);
    expect(points[13].key).toBe(localDateKey(new Date()));
  });

  it("buckets logs onto the matching local day", () => {
    const today = localDateKey(new Date());
    const logs = [
      { created_at: `${today}T09:00:00Z` },
      { created_at: `${today}T10:00:00Z` },
    ];
    const points = buildDailyActivity(logs, 7);
    const todayPoint = points.find((p) => p.key === today)!;
    expect(todayPoint.count).toBe(2);
    expect(points.filter((p) => p.key !== today).every((p) => p.count === 0)).toBe(true);
  });
});

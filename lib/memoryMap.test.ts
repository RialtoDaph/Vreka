import { describe, expect, it } from "vitest";
import { buildMemoryMapData } from "./memoryMap";
import { formatDate } from "./format";
import type { LifeMilestone } from "./types";

function baseInput() {
  return {
    tasks: [],
    goals: [],
    debts: [],
    notes: [],
    budgets: [],
    transactionsThisMonth: [],
    habits: [],
    habitChecks: [],
    journalEntries: [],
    milestones: [] as LifeMilestone[],
    calendarEvents: [],
    calendarConnected: false,
    gmailEmail: null,
    voiceEnabled: false,
  };
}

function milestone(overrides: Partial<LifeMilestone>): LifeMilestone {
  return {
    id: "m1",
    user_id: "u1",
    title: "Lulus kuliah",
    occurred_on: "2020-06-01",
    ended_on: null,
    category: "pendidikan",
    description: null,
    created_at: "2020-06-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildMemoryMapData", () => {
  it("includes a Timeline hub connected to the other 6 hubs in a ring", () => {
    const { nodes, edges } = buildMemoryMapData(baseInput());
    const hubs = nodes.filter((n) => n.type === "hub");
    expect(hubs).toHaveLength(7);
    expect(hubs.map((h) => h.id)).toContain("h-timeline");

    const timelineHub = hubs.find((h) => h.id === "h-timeline")!;
    expect(timelineHub.href).toBe("/dashboard/timeline");

    // Ring-connected: every hub has an edge to its neighbor.
    const hubEdgeCount = edges.filter(
      ([a, b]) => hubs.some((h) => h.id === a) && hubs.some((h) => h.id === b)
    ).length;
    expect(hubEdgeCount).toBe(7);
  });

  it("adds a leaf node per milestone, linked to the Timeline hub", () => {
    const { nodes, edges } = buildMemoryMapData({
      ...baseInput(),
      milestones: [milestone({ id: "m1", title: "Lulus kuliah" })],
    });

    const leaf = nodes.find((n) => n.id === "ms-m1");
    expect(leaf).toBeDefined();
    expect(leaf!.type).toBe("milestone");
    expect(leaf!.label).toBe("Lulus kuliah");
    expect(leaf!.link).toBe("h-timeline");
    expect(leaf!.fields).toContainEqual({ k: "Kategori", v: "Pendidikan" });
    expect(leaf!.fields).toContainEqual({ k: "Tanggal", v: formatDate("2020-06-01") });
    expect(edges).toContainEqual(["h-timeline", "ms-m1"]);
  });

  it("shows a date range for a milestone with an end date", () => {
    const { nodes } = buildMemoryMapData({
      ...baseInput(),
      milestones: [milestone({ id: "m2", occurred_on: "2018-08-01", ended_on: "2022-06-01" })],
    });

    const leaf = nodes.find((n) => n.id === "ms-m2")!;
    expect(leaf.fields).toContainEqual({
      k: "Tanggal",
      v: `${formatDate("2018-08-01")} – ${formatDate("2022-06-01")}`,
    });
  });

  it("caps milestones shown at 8", () => {
    const milestones = Array.from({ length: 12 }, (_, i) =>
      milestone({ id: `m${i}`, occurred_on: `2020-01-${String(i + 1).padStart(2, "0")}` })
    );
    const { nodes } = buildMemoryMapData({ ...baseInput(), milestones });
    expect(nodes.filter((n) => n.type === "milestone")).toHaveLength(8);
  });
});

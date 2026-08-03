import { describe, expect, it } from "vitest";
import { buildDailyBriefing, type BriefingInput } from "./dailyBriefing";

function baseInput(overrides: Partial<BriefingInput> = {}): BriefingInput {
  return {
    income: 0,
    expense: 0,
    budgetAlerts: [],
    dueTasks: [],
    overdueTasks: [],
    pendingHabits: [],
    calendarEvents: [],
    calendarConnected: false,
    ...overrides,
  };
}

describe("buildDailyBriefing priorities", () => {
  it("returns no priorities when nothing is urgent", () => {
    const { priorities } = buildDailyBriefing("Senin", baseInput());
    expect(priorities).toEqual([]);
  });

  it("ranks overdue tasks above due-today, budget, and habit signals", () => {
    const { priorities } = buildDailyBriefing(
      "Senin",
      baseInput({
        overdueTasks: [{ title: "Revisi laporan" }],
        dueTasks: [{ title: "Standup" }],
        budgetAlerts: [{ category: "Makan", pct: 95 }],
        pendingHabits: [{ title: "Olahraga", streak: 10 }],
      })
    );
    expect(priorities).toHaveLength(3); // capped
    expect(priorities[0]).toMatchObject({ tag: "Tugas telat", title: "Revisi laporan", color: "rose" });
    expect(priorities[1]).toMatchObject({ tag: "Deadline hari ini", title: "Standup", color: "amber" });
    expect(priorities[2].tag).toMatch(/Anggaran/);
  });

  it("picks the worst (highest %) budget category when several are over threshold", () => {
    const { priorities } = buildDailyBriefing(
      "Senin",
      baseInput({
        budgetAlerts: [
          { category: "Makan", pct: 91 },
          { category: "Transport", pct: 120 },
        ],
      })
    );
    expect(priorities[0].title).toBe("Transport udah 120% dari batas");
    expect(priorities[0].tag).toBe("Anggaran kebobolan");
  });

  it("only surfaces a habit with a positive streak, picking the longest", () => {
    const { priorities } = buildDailyBriefing(
      "Senin",
      baseInput({
        pendingHabits: [
          { title: "Baca buku", streak: 0 },
          { title: "Olahraga", streak: 5 },
          { title: "Tidur cepat", streak: 12 },
        ],
      })
    );
    expect(priorities).toHaveLength(1);
    expect(priorities[0].title).toBe("Tidur cepat — 12 hari beruntun");
  });

  it("summarizes extra overdue/due tasks in the reason instead of listing them all", () => {
    const { priorities } = buildDailyBriefing(
      "Senin",
      baseInput({ overdueTasks: [{ title: "A" }, { title: "B" }, { title: "C" }] })
    );
    expect(priorities[0].reason).toBe("+2 tugas telat lainnya");
  });
});

describe("buildDailyBriefing sections", () => {
  it("always includes Kerjaan and Keuangan, with a fallback line when nothing's due", () => {
    const { sections } = buildDailyBriefing("Senin", baseInput({ income: 5000, expense: 2000 }));
    const kerjaan = sections.find((s) => s.title === "Kerjaan hari ini")!;
    expect(kerjaan.items).toEqual(["Nggak ada deadline mendesak hari ini."]);
    const keuangan = sections.find((s) => s.title === "Keuangan")!;
    expect(keuangan.items[0]).toContain(formatCurrencyLike(3000));
  });

  it("only includes a Jadwal section when calendar is connected", () => {
    const disconnected = buildDailyBriefing("Senin", baseInput({ calendarConnected: false }));
    expect(disconnected.sections.some((s) => s.title === "Jadwal")).toBe(false);

    const connected = buildDailyBriefing(
      "Senin",
      baseInput({ calendarConnected: true, calendarEvents: [{ summary: "Meeting", start: "2026-08-03T09:00:00Z" }] })
    );
    const jadwal = connected.sections.find((s) => s.title === "Jadwal");
    expect(jadwal?.items[0]).toContain("Meeting");
  });

  it("reports every habit checked when nothing is pending", () => {
    const { sections } = buildDailyBriefing("Senin", baseInput());
    const kebiasaan = sections.find((s) => s.title === "Kebiasaan")!;
    expect(kebiasaan.items).toEqual(["Semua kebiasaan udah dicentang hari ini."]);
  });
});

describe("buildDailyBriefing summaryText", () => {
  it("includes the date label and every section title", () => {
    const { summaryText } = buildDailyBriefing("Senin, 3 Agustus 2026", baseInput());
    expect(summaryText).toContain("Senin, 3 Agustus 2026");
    expect(summaryText).toContain("Kerjaan hari ini:");
    expect(summaryText).toContain("Keuangan:");
    expect(summaryText).toContain("Kebiasaan:");
  });

  it("omits the priorities line entirely when there are none", () => {
    const { summaryText } = buildDailyBriefing("Senin", baseInput());
    expect(summaryText).not.toContain("Prioritas:");
  });
});

// Loose check that avoids hardcoding the exact NBSP/locale formatting --
// just confirms the rounded number shows up somewhere in the string.
function formatCurrencyLike(n: number): string {
  return n.toLocaleString("de-DE");
}

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

type SupabaseData = {
  txMonth?: unknown[];
  budgets?: unknown[];
  dueTasks?: unknown[];
  overdueTasks?: unknown[];
  habits?: unknown[];
  habitChecks?: unknown[];
  dailyBriefings?: unknown[];
  studyNotes?: unknown[];
  journalEntries?: unknown[];
  milestones?: unknown[];
};

// Thenable + fluent chain -- matches whatever combination of
// .select/.gte/.lte/.lt/.neq/.not/.order/.limit/.upsert the page chains per table.
function chainable(data: unknown[]) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    gte: () => obj,
    lte: () => obj,
    lt: () => obj,
    neq: () => obj,
    not: () => obj,
    order: () => obj,
    limit: () => obj,
    upsert: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase(rows: SupabaseData) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "transactions") return chainable(rows.txMonth ?? []);
        if (table === "budgets") return chainable(rows.budgets ?? []);
        if (table === "habits") return chainable(rows.habits ?? []);
        if (table === "habit_checks") return chainable(rows.habitChecks ?? []);
        if (table === "daily_briefings") return chainable(rows.dailyBriefings ?? []);
        if (table === "study_notes") return chainable(rows.studyNotes ?? []);
        if (table === "journal_entries") return chainable(rows.journalEntries ?? []);
        if (table === "life_milestones") return chainable(rows.milestones ?? []);
        if (table === "tasks") {
          // Distinguish the due-today vs overdue query by call order --
          // page.tsx issues due first, then overdue.
          taskCallCount += 1;
          return chainable(taskCallCount === 1 ? (rows.dueTasks ?? []) : (rows.overdueTasks ?? []));
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

let taskCallCount = 0;

beforeEach(() => {
  taskCallCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).includes("/api/google/calendar/list")) {
        return Promise.resolve({ json: async () => ({ connected: false, events: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    })
  );
});

describe("RingkasanPage", () => {
  it("shows a fallback message when nothing is urgent", async () => {
    mockSupabase({});
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    // The bullet "• " lives in the same <li> as a sibling text node, so the
    // list item's exact text content is "• <item>" -- match on a substring.
    expect(await screen.findByText(/Nggak ada deadline mendesak hari ini\./)).toBeInTheDocument();
    expect(screen.getByText(/Semua kebiasaan udah dicentang hari ini\./)).toBeInTheDocument();
  });

  it("surfaces an overdue task as the #1 priority", async () => {
    mockSupabase({ overdueTasks: [{ title: "Revisi laporan" }] });
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    expect(await screen.findByText("Revisi laporan")).toBeInTheDocument();
    expect(screen.getByText("Tugas telat")).toBeInTheDocument();
  });

  it("lets the user ask Aslan for an insight on the top priority", async () => {
    mockSupabase({ overdueTasks: [{ title: "Revisi laporan" }] });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("calendar/list")) {
          return Promise.resolve({ json: async () => ({ connected: false, events: [] }) });
        }
        if (String(url).includes("node-insight")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ text: "Selesaiin dulu sebelum nambah kerjaan baru.", sources: [] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );

    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    fireEvent.click(await screen.findByText("Minta insight"));
    expect(
      await screen.findByText("Selesaiin dulu sebelum nambah kerjaan baru.")
    ).toBeInTheDocument();
  });

  it("re-runs the briefing on refresh", async () => {
    mockSupabase({ overdueTasks: [{ title: "Revisi laporan" }] });
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    expect(await screen.findByText("Revisi laporan")).toBeInTheDocument();
    fireEvent.click(screen.getByText("↻ Refresh"));

    await waitFor(() => expect(taskCallCount).toBeGreaterThan(2));
  });

  it("shows past briefing history, collapsed until clicked", async () => {
    mockSupabase({
      dailyBriefings: [
        { id: "b1", briefing_date: "2026-08-02", preview: "Fokus: laporan mingguan, saldo naik." },
      ],
    });
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    expect(await screen.findByText("Riwayat Briefing")).toBeInTheDocument();
    expect(screen.queryByText("Fokus: laporan mingguan, saldo naik.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("02 Agu 2026"));
    expect(screen.getByText("Fokus: laporan mingguan, saldo naik.")).toBeInTheDocument();
  });

  it("hides the history section when there's no past briefing", async () => {
    mockSupabase({});
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    await screen.findByText(/Nggak ada deadline mendesak hari ini\./);
    expect(screen.queryByText("Riwayat Briefing")).not.toBeInTheDocument();
  });

  it("omits Pelajaran, Jurnal, and Timeline when there's nothing to report for them", async () => {
    mockSupabase({});
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    await screen.findByText(/Nggak ada deadline mendesak hari ini\./);
    expect(screen.queryByText("Pelajaran")).not.toBeInTheDocument();
    expect(screen.queryByText("Jurnal")).not.toBeInTheDocument();
    expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
  });

  it("surfaces stale study notes, journal streak, and an upcoming milestone once there's data", async () => {
    mockSupabase({
      studyNotes: [
        { title: "Kalkulus II", progress: 40, updated_at: "2020-01-01T00:00:00Z" },
      ],
      journalEntries: [{ entry_date: todayKeyForTest() }],
      milestones: [{ title: "Anniversary kerja", occurred_on: todayKeyForTest() }],
    });
    const { default: RingkasanPage } = await import("./page");
    render(<RingkasanPage />);

    expect(await screen.findByText(/Kalkulus II/)).toBeInTheDocument();
    expect(screen.getByText(/Udah nulis jurnal hari ini/)).toBeInTheDocument();
    expect(screen.getByText(/Anniversary kerja \(Hari ini\)/)).toBeInTheDocument();
  });
});

function todayKeyForTest(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

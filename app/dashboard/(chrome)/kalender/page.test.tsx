// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function mockSupabase(taskRows: unknown[], debtRows: unknown[], goalRows: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "tasks") {
          return {
            select: () => ({
              not: () => ({
                gte: () => ({ lt: () => Promise.resolve({ data: taskRows, error: null }) }),
              }),
            }),
          };
        }
        if (table === "debts") {
          return {
            select: () => ({
              eq: () => ({
                not: () => ({
                  gte: () => ({ lte: () => Promise.resolve({ data: debtRows, error: null }) }),
                }),
              }),
            }),
          };
        }
        if (table === "savings_goals") {
          return {
            select: () => ({
              not: () => ({
                gte: () => ({ lte: () => Promise.resolve({ data: goalRows, error: null }) }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("KalenderPage", () => {
  it("shows today's task deadline, debt due date, and savings goal deadline in the agenda", async () => {
    const today = todayStr();
    mockSupabase(
      [{ title: "Kirim laporan", deadline: `${today}T10:00:00Z` }],
      [{ party_name: "Budi", direction: "i_owe", due_date: today }],
      [{ name: "Dana Darurat", deadline: today }]
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ connected: false, events: [] }) })
    );

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    expect(await screen.findByText("Kirim laporan")).toBeInTheDocument();
    expect(screen.getByText("Bayar Budi")).toBeInTheDocument();
    expect(screen.getByText("Dana Darurat")).toBeInTheDocument();
    expect(screen.getByText(/belum di-connect/)).toBeInTheDocument();
  });

  it("shows the empty state for a day with nothing scheduled", async () => {
    mockSupabase([], [], []);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ connected: false, events: [] }) })
    );

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    expect(await screen.findByText("Nggak ada apa-apa di hari ini.")).toBeInTheDocument();
  });

  it("switches the agenda when a different day in the grid is selected", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    // Only run this scenario when tomorrow stays in the same visible month,
    // so the day button is guaranteed to be on-screen without navigating.
    if (tomorrow.getMonth() !== today.getMonth()) {
      return;
    }

    mockSupabase([{ title: "Besok punya deadline", deadline: `${tomorrowKey}T09:00:00Z` }], [], []);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ connected: false, events: [] }) })
    );

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    expect(await screen.findByText("Nggak ada apa-apa di hari ini.")).toBeInTheDocument();

    // aria-label is the ISO date key, so this is unambiguous even when a
    // padding day from an adjacent month shows the same day-of-month number.
    fireEvent.click(screen.getByLabelText(tomorrowKey));

    expect(await screen.findByText("Besok punya deadline")).toBeInTheDocument();
  });

  it("caps a busy day's dots at 3 and shows a +N overflow count for the rest", async () => {
    const today = todayStr();
    mockSupabase(
      [
        { title: "Tugas 1", deadline: `${today}T08:00:00Z` },
        { title: "Tugas 2", deadline: `${today}T09:00:00Z` },
        { title: "Tugas 3", deadline: `${today}T10:00:00Z` },
        { title: "Tugas 4", deadline: `${today}T11:00:00Z` },
      ],
      [],
      []
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ connected: false, events: [] }) })
    );

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    const dayCell = await screen.findByLabelText(today);
    expect(dayCell.querySelectorAll(".rounded-full")).toHaveLength(3);
    expect(dayCell).toHaveTextContent("+1");
  });

  it("doesn't show an overflow count for a day with 3 or fewer items", async () => {
    const today = todayStr();
    mockSupabase(
      [
        { title: "Tugas 1", deadline: `${today}T08:00:00Z` },
        { title: "Tugas 2", deadline: `${today}T09:00:00Z` },
      ],
      [],
      []
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ connected: false, events: [] }) })
    );

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    const dayCell = await screen.findByLabelText(today);
    expect(dayCell.querySelectorAll(".rounded-full")).toHaveLength(2);
    expect(dayCell).not.toHaveTextContent("+");
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

function mockSupabase(
  taskRows: unknown[] = [],
  debtRows: unknown[] = [],
  goalRows: unknown[] = [],
  sessionRows: unknown[] = []
) {
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
              eq: () => Promise.resolve({ data: debtRows, error: null }),
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
        if (table === "study_sessions") {
          return {
            select: () => ({
              gte: () => ({ lt: () => Promise.resolve({ data: sessionRows, error: null }) }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

function mockDisconnectedCalendar() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: async () => ({ connected: false, events: [] }) })
  );
}

describe("KalenderPage", () => {
  it("shows today's task deadline, debt due date, and savings goal deadline when the day is opened", async () => {
    const today = todayStr();
    mockSupabase(
      [{ title: "Kirim laporan", deadline: `${today}T10:00:00Z` }],
      [{ party_name: "Budi", direction: "i_owe", due_date: today, is_recurring: false, recurrence_day: null }],
      [{ name: "Dana Darurat", deadline: today }]
    );
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    fireEvent.click(await screen.findByLabelText(today));

    // Item labels can legitimately appear twice -- once as a compact chip
    // in the day cell, once in the opened day's full detail list -- so
    // assert presence rather than a single unique match.
    expect(await screen.findAllByText("Kirim laporan")).not.toHaveLength(0);
    expect(screen.getAllByText("Bayar Budi")).not.toHaveLength(0);
    expect(screen.getAllByText("Dana Darurat")).not.toHaveLength(0);
    expect(screen.getByText(/belum di-connect/)).toBeInTheDocument();
  });

  it("shows an empty state for a day with nothing scheduled", async () => {
    mockSupabase();
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    fireEvent.click(await screen.findByLabelText(todayStr()));

    expect(await screen.findByText("Tidak ada aktivitas.")).toBeInTheDocument();
  });

  it("no day modal is open until a day cell is clicked", async () => {
    mockSupabase();
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    await screen.findByLabelText(todayStr());
    expect(screen.queryByText("Tidak ada aktivitas.")).not.toBeInTheDocument();
  });

  it("switches the agenda when a different day in the grid is opened", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    // Only run this scenario when tomorrow stays in the same visible month,
    // so the day button is guaranteed to be on-screen without navigating.
    if (tomorrow.getMonth() !== today.getMonth()) {
      return;
    }

    mockSupabase([{ title: "Besok punya deadline", deadline: `${tomorrowKey}T09:00:00Z` }]);
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    // aria-label is the ISO date key, so this is unambiguous even when a
    // padding day from an adjacent month shows the same day-of-month number.
    fireEvent.click(await screen.findByLabelText(tomorrowKey));

    expect(await screen.findAllByText("Besok punya deadline")).not.toHaveLength(0);
  });

  it("caps a busy day's chips at 2 and shows a +N lagi overflow count for the rest", async () => {
    const today = todayStr();
    mockSupabase([
      { title: "Tugas 1", deadline: `${today}T08:00:00Z` },
      { title: "Tugas 2", deadline: `${today}T09:00:00Z` },
      { title: "Tugas 3", deadline: `${today}T10:00:00Z` },
      { title: "Tugas 4", deadline: `${today}T11:00:00Z` },
    ]);
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    const dayCell = await screen.findByLabelText(today);
    expect(dayCell.querySelectorAll(".rounded-full")).toHaveLength(2);
    expect(dayCell).toHaveTextContent("+2 lagi");
  });

  it("doesn't show an overflow count for a day with 2 or fewer items", async () => {
    const today = todayStr();
    mockSupabase([
      { title: "Tugas 1", deadline: `${today}T08:00:00Z` },
      { title: "Tugas 2", deadline: `${today}T09:00:00Z` },
    ]);
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    const dayCell = await screen.findByLabelText(today);
    expect(dayCell.querySelectorAll(".rounded-full")).toHaveLength(2);
    expect(dayCell).not.toHaveTextContent("lagi");
  });

  it("shows a recurring debt on its recurrence day this month", async () => {
    const now = new Date();
    const occursOn = new Date(now.getFullYear(), now.getMonth(), 15);
    // Skip if day 15 doesn't land in this visible month (shouldn't happen,
    // but guards against an unlikely calendar edge case).
    if (occursOn.getMonth() !== now.getMonth()) return;
    const occursKey = occursOn.toISOString().slice(0, 10);

    mockSupabase(
      [],
      [{ party_name: "Bank Transfer", direction: "i_owe", due_date: null, is_recurring: true, recurrence_day: 15 }]
    );
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    fireEvent.click(await screen.findByLabelText(occursKey));
    expect(await screen.findAllByText("Bayar Bank Transfer")).not.toHaveLength(0);
  });

  it("shows a day's full item list inline in the week view, without opening a day modal", async () => {
    const today = todayStr();
    mockSupabase([
      { title: "Tugas 1", deadline: `${today}T08:00:00Z` },
      { title: "Tugas 2", deadline: `${today}T09:00:00Z` },
      { title: "Tugas 3", deadline: `${today}T10:00:00Z` },
    ]);
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    await screen.findByLabelText(today);
    fireEvent.click(screen.getByText("Minggu"));

    // All 3 show up directly (no "+N lagi" capping, no day click needed) --
    // that's the whole point of the agenda view over the month grid's chips.
    expect(await screen.findByText("Tugas 1")).toBeInTheDocument();
    expect(screen.getByText("Tugas 2")).toBeInTheDocument();
    expect(screen.getByText("Tugas 3")).toBeInTheDocument();
    expect(screen.queryByText(/lagi/)).not.toBeInTheDocument();
  });

  it("shows Kosong for an empty day in the week view", async () => {
    mockSupabase();
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    await screen.findByLabelText(todayStr());
    fireEvent.click(screen.getByText("Minggu"));

    expect((await screen.findAllByText("Kosong.")).length).toBeGreaterThan(0);
  });

  it("quick-adds an event for a specific day from the week view", async () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);
    // Only meaningful when tomorrow stays in the same visible week.
    if (tomorrow.getDay() === 0) return;

    mockSupabase();
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    await screen.findByLabelText(todayStr());
    fireEvent.click(screen.getByText("Minggu"));

    const tomorrowHeading = await screen.findByText(
      new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "short" }).format(tomorrow)
    );
    const dayPanel = tomorrowHeading.closest("div.relative") as HTMLElement;
    fireEvent.click(within(dayPanel).getByText("+ Event"));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe(tomorrowKey);
  });

  it("shows a study session as a Pelajaran item on the day it happened", async () => {
    const today = todayStr();
    mockSupabase([], [], [], [
      { created_at: `${today}T14:00:00Z`, study_notes: [{ title: "Bahasa Jerman" }] },
    ]);
    mockDisconnectedCalendar();

    const { default: KalenderPage } = await import("./page");
    render(<KalenderPage />);

    fireEvent.click(await screen.findByLabelText(today));
    expect(await screen.findAllByText("Belajar Bahasa Jerman")).not.toHaveLength(0);
    // "· Pelajaran" (the item's category line) rather than a bare
    // "Pelajaran" match, which would also hit the legend row below the grid.
    expect(screen.getByText(/· Pelajaran/)).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// recharts' ResponsiveContainer only renders its children once a
// ResizeObserver reports a non-zero size, which jsdom never does on its own
// — the mock has to actually invoke the callback, not just be present.
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: 600,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: 300,
  });
  class ResizeObserverMock {
    #callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.#callback = callback;
    }
    observe(target: Element) {
      this.#callback(
        [{ target, contentRect: { width: 600, height: 300 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver
      );
    }
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase(txRows: unknown[], accountRows: unknown[] = []) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "transactions") {
          return { select: () => Promise.resolve({ data: txRows, error: null }) };
        }
        if (table === "accounts") {
          return { select: () => Promise.resolve({ data: accountRows, error: null }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

describe("AnalyticsTab", () => {
  it("renders the category breakdown for the current month's expenses", async () => {
    const month = currentMonthPrefix();
    mockSupabase([
      { type: "expense", category: "Makanan", amount: 150, occurred_on: `${month}-05`, account_id: null, to_account_id: null },
      { type: "expense", category: "Transportasi", amount: 50, occurred_on: `${month}-10`, account_id: null, to_account_id: null },
      { type: "income", category: "Gaji", amount: 2000, occurred_on: `${month}-01`, account_id: null, to_account_id: null },
    ]);
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    // recharts renders each axis tick twice (an offscreen pass to measure
    // text width, then the real one), so category names show up more than
    // once — assert presence via findAllByText rather than a single match.
    expect((await screen.findAllByText("Makanan")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transportasi").length).toBeGreaterThan(0);
    // Income shouldn't leak into the expense-by-category breakdown.
    expect(screen.queryByText("Gaji")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when there's no spending this month", async () => {
    mockSupabase([]);
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    expect((await screen.findAllByText("Belum ada pengeluaran bulan ini.")).length).toBeGreaterThan(0);
  });

  it("does not crash when a transaction falls outside the current month", async () => {
    mockSupabase([
      { type: "expense", category: "Ancient", amount: 10, occurred_on: "1999-01-01", account_id: null, to_account_id: null },
    ]);
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    expect((await screen.findAllByText("Belum ada pengeluaran bulan ini.")).length).toBeGreaterThan(0);
  });

  it("shows a placeholder for the net worth trend when there are no accounts yet", async () => {
    mockSupabase([]);
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    expect(
      await screen.findByText(/Belum ada rekening tercatat/)
    ).toBeInTheDocument();
  });

  it("reconstructs a past month-end balance from starting balance plus transactions up to that point", async () => {
    const month = currentMonthPrefix();
    mockSupabase(
      [
        // Dated well before the MONTHS_BACK window -- should still count
        // toward the reconstructed balance even though it's too old to show
        // up in the "Tren 6 Bulan" chart itself.
        { type: "income", category: "Gaji", amount: 500, occurred_on: "2020-01-15", account_id: "a1", to_account_id: null },
        { type: "expense", category: "Makanan", amount: 100, occurred_on: `${month}-05`, account_id: "a1", to_account_id: null },
      ],
      [{ id: "a1", user_id: "u1", name: "Utama", starting_balance: 1000, is_primary: true, created_at: "2019-01-01" }]
    );
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    // 1000 starting + 500 income - 100 expense = 1400, formatted with the
    // app's de-DE-style EUR grouping.
    expect(await screen.findByText(/1\.400,00/)).toBeInTheDocument();
  });

  it("folds categories past the 5th into a Lainnya bucket in the distribution chart", async () => {
    const month = currentMonthPrefix();
    const cats = ["A", "B", "C", "D", "E", "F", "G"];
    mockSupabase(
      cats.map((c, i) => ({
        type: "expense",
        category: c,
        amount: 100 - i,
        occurred_on: `${month}-05`,
        account_id: null,
        to_account_id: null,
      }))
    );
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    await screen.findByText("Lainnya");
    // Scoped to the donut's own legend list -- "F"/"G" legitimately still
    // show up in the separate top-8 bar chart above, so a page-wide query
    // would give a false negative.
    const donutPanel = screen.getByText("Distribusi Pengeluaran (Bulan Ini)").closest("div.relative") as HTMLElement;
    for (const c of ["A", "B", "C", "D", "E", "Lainnya"]) {
      expect(within(donutPanel).getByText(c)).toBeInTheDocument();
    }
    expect(within(donutPanel).queryByText("F")).not.toBeInTheDocument();
  });
});

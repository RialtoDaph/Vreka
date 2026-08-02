// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

function mockSupabaseRows(rows: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          gte: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
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
    mockSupabaseRows([
      { type: "expense", category: "Makanan", amount: 150, occurred_on: `${month}-05` },
      { type: "expense", category: "Transportasi", amount: 50, occurred_on: `${month}-10` },
      { type: "income", category: "Gaji", amount: 2000, occurred_on: `${month}-01` },
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
    mockSupabaseRows([]);
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    expect(await screen.findByText("Belum ada pengeluaran bulan ini.")).toBeInTheDocument();
  });

  it("does not crash when a transaction falls outside the loaded month window", async () => {
    mockSupabaseRows([
      { type: "expense", category: "Ancient", amount: 10, occurred_on: "1999-01-01" },
    ]);
    const { default: Analytics } = await import("./AnalyticsTab");
    render(<Analytics />);

    expect(await screen.findByText("Belum ada pengeluaran bulan ini.")).toBeInTheDocument();
  });
});

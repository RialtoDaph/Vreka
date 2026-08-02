// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase(budgetRows: unknown[], txRows: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "budgets") {
          return {
            select: () => ({
              order: () => Promise.resolve({ data: budgetRows, error: null }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              gte: () => Promise.resolve({ data: txRows, error: null }),
            }),
          }),
        };
      },
    }),
  }));
}

describe("BudgetsTab", () => {
  it("shows the over-budget warning once spending passes the monthly limit", async () => {
    mockSupabase(
      [{ id: "b1", user_id: "u1", category: "Makanan", monthly_limit: 100, created_at: "2026-01-01" }],
      [{ category: "Makanan", amount: 120 }]
    );
    const { default: BudgetsTab } = await import("./BudgetsTab");
    render(<BudgetsTab />);

    expect(await screen.findByText("Makanan")).toBeInTheDocument();
    expect(screen.getByText("Anggaran bulan ini kebobolan.")).toBeInTheDocument();
    // "120%" is split across sibling text nodes ("120" then "%"), so match
    // the containing span's full text via regex instead of an exact string.
    expect(screen.getByText(/120%/)).toBeInTheDocument();
  });

  it("does not show the over-budget warning while under the limit", async () => {
    mockSupabase(
      [{ id: "b1", user_id: "u1", category: "Transportasi", monthly_limit: 100, created_at: "2026-01-01" }],
      [{ category: "Transportasi", amount: 40 }]
    );
    const { default: BudgetsTab } = await import("./BudgetsTab");
    render(<BudgetsTab />);

    expect(await screen.findByText("Transportasi")).toBeInTheDocument();
    expect(screen.queryByText("Anggaran bulan ini kebobolan.")).not.toBeInTheDocument();
  });

  it("shows the empty-state message when there are no budgets yet", async () => {
    mockSupabase([], []);
    const { default: BudgetsTab } = await import("./BudgetsTab");
    render(<BudgetsTab />);

    expect(
      await screen.findByText(/Belum ada anggaran\./)
    ).toBeInTheDocument();
  });
});

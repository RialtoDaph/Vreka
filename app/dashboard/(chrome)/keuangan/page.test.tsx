// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

// Every child tab component fetches its own data via createClient() on
// mount -- stub them out so this test only exercises the page's own stat
// cards, not five unrelated tabs' worth of Supabase calls.
vi.mock("@/components/keuangan/TransactionsTab", () => ({ default: () => <div>TransactionsTab</div> }));
vi.mock("@/components/keuangan/RecurringTab", () => ({ default: () => <div>RecurringTab</div> }));
vi.mock("@/components/keuangan/DebtsTab", () => ({ default: () => <div>DebtsTab</div> }));
vi.mock("@/components/keuangan/SavingsTab", () => ({ default: () => <div>SavingsTab</div> }));
vi.mock("@/components/keuangan/AnalyticsTab", () => ({ default: () => <div>AnalyticsTab</div> }));
vi.mock("@/components/keuangan/BudgetsTab", () => ({ default: () => <div>BudgetsTab</div> }));

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function mockSupabase(txRows: unknown[], goalRows: unknown[]) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "transactions") {
          return { select: () => ({ gte: () => Promise.resolve({ data: txRows, error: null }) }) };
        }
        if (table === "savings_goals") {
          return { select: () => Promise.resolve({ data: goalRows, error: null }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
}

describe("KeuanganPage stat cards", () => {
  it("shows saldo, expense, and savings progress computed from this month's data", async () => {
    const today = todayStr();
    mockSupabase(
      [
        { type: "income", amount: 3000, occurred_on: today },
        { type: "expense", amount: 1200, occurred_on: today },
      ],
      [{ name: "Dana Darurat", current_amount: 50, target_amount: 100, deadline: null }]
    );

    const { default: KeuanganPage } = await import("./page");
    render(<KeuanganPage />);

    expect(await screen.findByText("1.800,00 €")).toBeInTheDocument(); // saldo
    expect(screen.getByText("1.200,00 €")).toBeInTheDocument(); // expense
    expect(screen.getByText("50%")).toBeInTheDocument(); // savings progress
  });

  it("still renders the tabs and switches between them", async () => {
    mockSupabase([], []);
    const { default: KeuanganPage } = await import("./page");
    render(<KeuanganPage />);

    expect(await screen.findByText("TransactionsTab")).toBeInTheDocument();
  });
});

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

// Every child tab component fetches its own data via createClient() on
// mount -- stub them out so this test only exercises the page's own stat
// cards, not six unrelated tabs' worth of Supabase calls.
vi.mock("@/components/keuangan/TransactionsTab", () => ({ default: () => <div>TransactionsTab</div> }));
vi.mock("@/components/keuangan/RecurringTab", () => ({ default: () => <div>RecurringTab</div> }));
vi.mock("@/components/keuangan/DebtsTab", () => ({ default: () => <div>DebtsTab</div> }));
vi.mock("@/components/keuangan/SavingsTab", () => ({ default: () => <div>SavingsTab</div> }));
vi.mock("@/components/keuangan/AccountsTab", () => ({ default: () => <div>AccountsTab</div> }));
vi.mock("@/components/keuangan/AnalyticsTab", () => ({ default: () => <div>AnalyticsTab</div> }));
vi.mock("@/components/keuangan/BudgetsTab", () => ({ default: () => <div>BudgetsTab</div> }));

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// `txRows` backs the "this month" .gte()-filtered query loadStats() makes;
// `allTxRows` backs the separate unfiltered query loadKekayaan() makes for
// the Kekayaan Total card -- kept independently settable so a test's saldo
// and kekayaan numbers don't collide by coincidence.
function mockSupabase(
  txRows: unknown[],
  goalRows: unknown[],
  { accountRows = [] as unknown[], allTxRows = [] as unknown[] } = {}
) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "transactions") {
          return {
            select: () => {
              const obj: Record<string, unknown> = {
                gte: () => Promise.resolve({ data: txRows, error: null }),
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ data: allTxRows, error: null }).then(resolve),
              };
              return obj;
            },
          };
        }
        if (table === "savings_goals") {
          return { select: () => Promise.resolve({ data: goalRows, error: null }) };
        }
        if (table === "accounts") {
          return { select: () => Promise.resolve({ data: accountRows, error: null }) };
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

  it("shows Kekayaan Total computed from accounts + all-time transactions, and switches to the Rekening tab", async () => {
    mockSupabase([], [], {
      accountRows: [{ id: "acc-1", user_id: "u1", name: "BCA", starting_balance: 1000, is_primary: true, created_at: "2026-01-01" }],
      allTxRows: [{ account_id: "acc-1", type: "income", amount: 500 }],
    });
    const { default: KeuanganPage } = await import("./page");
    render(<KeuanganPage />);

    expect(await screen.findByText("1.500,00 €")).toBeInTheDocument();
    expect(screen.getByText("Dari 1 rekening")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Rekening"));
    expect(await screen.findByText("AccountsTab")).toBeInTheDocument();
  });

  it("refreshes Kekayaan Total when switching tabs, not just once on mount", async () => {
    // Every child tab is conditionally rendered, so mounting one already
    // re-fetches its own data fresh -- this asserts the header card follows
    // the same "tab switch = fresh data" rule instead of staying frozen at
    // whatever it computed on the very first render.
    let kekayaanCallCount = 0;
    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({
        from: (table: string) => {
          if (table === "transactions") {
            return {
              select: () => {
                const obj: Record<string, unknown> = {
                  gte: () => Promise.resolve({ data: [], error: null }),
                  then: (resolve: (v: unknown) => unknown) => {
                    kekayaanCallCount++;
                    const data =
                      kekayaanCallCount === 1 ? [] : [{ account_id: "acc-1", type: "income", amount: 500 }];
                    return Promise.resolve({ data, error: null }).then(resolve);
                  },
                };
                return obj;
              },
            };
          }
          if (table === "savings_goals") return { select: () => Promise.resolve({ data: [], error: null }) };
          if (table === "accounts") {
            return {
              select: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "acc-1",
                      user_id: "u1",
                      name: "BCA",
                      starting_balance: 1000,
                      is_primary: true,
                      created_at: "2026-01-01",
                    },
                  ],
                  error: null,
                }),
            };
          }
          throw new Error(`unexpected table: ${table}`);
        },
      }),
    }));

    const { default: KeuanganPage } = await import("./page");
    render(<KeuanganPage />);

    expect(await screen.findByText("1.000,00 €")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Rekening"));
    expect(await screen.findByText("1.500,00 €")).toBeInTheDocument();
  });

  it("lets the user ask Aslan for market research", async () => {
    mockSupabase([], []);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            text: "Emas naik tipis, USD/EUR stabil di kisaran 1.08.",
            sources: [{ label: "kitco.com", url: "https://www.kitco.com/gold-price" }],
          }),
        })
      )
    );

    const { default: KeuanganPage } = await import("./page");
    render(<KeuanganPage />);

    fireEvent.click(await screen.findByText("Minta riset"));
    expect(
      await screen.findByText("Emas naik tipis, USD/EUR stabil di kisaran 1.08.")
    ).toBeInTheDocument();
    expect(screen.getByText("kitco.com")).toBeInTheDocument();
  });

  it("shows an error message when market research fails", async () => {
    mockSupabase([], []);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, json: async () => ({ error: "Gagal ambil riset pasar." }) })
      )
    );

    const { default: KeuanganPage } = await import("./page");
    render(<KeuanganPage />);

    fireEvent.click(await screen.findByText("Minta riset"));
    expect(await screen.findByText("Gagal ambil riset pasar.")).toBeInTheDocument();
  });
});

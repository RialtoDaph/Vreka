// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

const DEBTS = [
  { id: "d1", party_name: "Budi", direction: "i_owe", amount: 450, status: "unpaid", due_date: null, notes: null },
  {
    id: "d2",
    party_name: "Toko Elektronik",
    direction: "i_owe",
    amount: 120,
    status: "paid",
    due_date: null,
    notes: null,
  },
  {
    id: "d3",
    party_name: "Sarah",
    direction: "owed_to_me",
    amount: 200,
    status: "unpaid",
    due_date: null,
    notes: null,
  },
];

function mockSupabase() {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: () => ({
        select: () => ({
          order: () => ({
            order: () => Promise.resolve({ data: DEBTS, error: null }),
          }),
        }),
      }),
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    }),
  }));
}

describe("DebtsTab", () => {
  it("totals only unpaid debts per direction", async () => {
    mockSupabase();
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    await screen.findByText("Budi");
    // d2 (Toko Elektronik) is paid, so it must not inflate the utang total
    // -- unpaid Budi (450) alone, not 450 + 120.
    const utangCard = screen.getByText("Total Utang (kamu berutang)").parentElement!;
    expect(within(utangCard).getByText("450,00 €")).toBeInTheDocument();
    const piutangCard = screen.getByText("Total Piutang (kamu ditagih)").parentElement!;
    expect(within(piutangCard).getByText("200,00 €")).toBeInTheDocument();
  });

  it("filters the list by direction without touching the totals", async () => {
    mockSupabase();
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    await screen.findByText("Budi");
    expect(screen.getByText("Sarah")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Piutang ke Aku"));

    expect(screen.queryByText("Budi")).not.toBeInTheDocument();
    expect(screen.getByText("Sarah")).toBeInTheDocument();
    // Totals cards stay put regardless of the list filter.
    const utangCard = screen.getByText("Total Utang (kamu berutang)").parentElement!;
    expect(within(utangCard).getByText("450,00 €")).toBeInTheDocument();
  });

  it("shows a filtered-empty message when a direction has no matches", async () => {
    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({
        from: () => ({
          select: () => ({
            order: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      id: "d1",
                      party_name: "Budi",
                      direction: "i_owe",
                      amount: 450,
                      status: "unpaid",
                      due_date: null,
                      notes: null,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }),
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }),
    }));
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    await screen.findByText("Budi");
    fireEvent.click(screen.getByText("Piutang ke Aku"));

    expect(await screen.findByText("Gak ada data di filter ini.")).toBeInTheDocument();
  });
});

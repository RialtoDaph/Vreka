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
  {
    id: "d1",
    party_name: "Budi",
    direction: "i_owe",
    amount: 450,
    status: "unpaid",
    due_date: null,
    notes: null,
    is_recurring: false,
    recurrence_day: null,
  },
  {
    id: "d2",
    party_name: "Toko Elektronik",
    direction: "i_owe",
    amount: 120,
    status: "paid",
    due_date: null,
    notes: null,
    is_recurring: false,
    recurrence_day: null,
  },
  {
    id: "d3",
    party_name: "Sarah",
    direction: "owed_to_me",
    amount: 200,
    status: "unpaid",
    due_date: null,
    notes: null,
    is_recurring: false,
    recurrence_day: null,
  },
];

// Chainable double covering both tables DebtsTab reads/writes: debts
// (select().order().order() reads, insert/update/delete writes) and
// debt_payment_checks (select().eq() reads, insert().select().single()/
// delete().eq() writes).
function chainableDebtsTable(rows: unknown[]) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    eq: () => obj,
    update: () => obj,
    delete: () => obj,
    insert: () => obj,
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return obj;
}

function chainableChecksTable(rows: unknown[], onInsert?: (payload: Record<string, unknown>) => void) {
  let newId = 0;
  let pendingInsert: Record<string, unknown> | null = null;
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    insert: (payload: Record<string, unknown>) => {
      pendingInsert = payload;
      onInsert?.(payload);
      return obj;
    },
    delete: () => obj,
    single: () =>
      Promise.resolve({
        data: pendingInsert
          ? { id: `check-${++newId}`, created_at: "now", paid_at: "now", ...pendingInsert }
          : null,
        error: null,
      }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase(debts: unknown[] = DEBTS, checks: unknown[] = []) {
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "debts") return chainableDebtsTable(debts);
        if (table === "debt_payment_checks") return chainableChecksTable(checks);
        throw new Error(`unexpected table: ${table}`);
      },
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
    mockSupabase([
      {
        id: "d1",
        party_name: "Budi",
        direction: "i_owe",
        amount: 450,
        status: "unpaid",
        due_date: null,
        notes: null,
        is_recurring: false,
        recurrence_day: null,
      },
    ]);
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    await screen.findByText("Budi");
    fireEvent.click(screen.getByText("Piutang ke Aku"));

    expect(await screen.findByText("Gak ada data di filter ini.")).toBeInTheDocument();
  });

  it("shows the recurrence day instead of a due date for a recurring debt", async () => {
    mockSupabase([
      {
        id: "d1",
        party_name: "Bank Transfer",
        direction: "i_owe",
        amount: 500,
        status: "unpaid",
        due_date: null,
        notes: null,
        is_recurring: true,
        recurrence_day: 20,
      },
    ]);
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    expect(await screen.findByText("Berulang · tiap tanggal 20")).toBeInTheDocument();
    expect(screen.getByLabelText("Sudah bayar Bank Transfer bulan ini")).toBeInTheDocument();
    // A recurring debt is closed out entirely, not "lunas"-per-cycle.
    expect(screen.getByText("Tutup utang")).toBeInTheDocument();
  });

  it("checks off this cycle's payment for a recurring debt", async () => {
    const inserted: Record<string, unknown>[] = [];
    vi.doMock("@/lib/supabase/client", () => ({
      createClient: () => ({
        from: (table: string) => {
          if (table === "debts")
            return chainableDebtsTable([
              {
                id: "d1",
                party_name: "Bank Transfer",
                direction: "i_owe",
                amount: 500,
                status: "unpaid",
                due_date: null,
                notes: null,
                is_recurring: true,
                recurrence_day: 20,
              },
            ]);
          if (table === "debt_payment_checks") return chainableChecksTable([], (p) => inserted.push(p));
          throw new Error(`unexpected table: ${table}`);
        },
        auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      }),
    }));
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    const checkbox = await screen.findByLabelText("Sudah bayar Bank Transfer bulan ini");
    fireEvent.click(checkbox);

    expect(await screen.findByText("BULAN INI LUNAS")).toBeInTheDocument();
    expect(inserted[0]).toMatchObject({ debt_id: "d1" });
  });

  it("does not show a cycle checkbox for a one-off (non-recurring) debt", async () => {
    mockSupabase();
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    await screen.findByText("Budi");
    expect(screen.queryByLabelText(/Sudah bayar/)).not.toBeInTheDocument();
  });
});

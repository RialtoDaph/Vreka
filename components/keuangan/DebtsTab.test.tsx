// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
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

// Simple chainable double: reads resolve to `rows` via the thenable, writes
// (insert/update/delete) are captured through the callbacks so a test can
// assert on payloads and control what a subsequent .select().single() returns.
function chainableTable(
  rows: unknown[],
  opts: {
    onInsert?: (payload: Record<string, unknown>) => unknown;
    onUpdate?: (payload: Record<string, unknown>) => void;
    onDelete?: () => void;
  } = {}
) {
  let pendingResult: unknown = null;
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    eq: () => obj,
    update: (payload: Record<string, unknown>) => {
      opts.onUpdate?.(payload);
      return obj;
    },
    delete: () => {
      opts.onDelete?.();
      return obj;
    },
    insert: (payload: Record<string, unknown>) => {
      pendingResult = opts.onInsert ? opts.onInsert(payload) : { id: "new-id", ...payload };
      return obj;
    },
    single: () => Promise.resolve({ data: pendingResult, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase(opts: {
  debts?: unknown[];
  payments?: unknown[];
  onTxInsert?: (payload: Record<string, unknown>) => unknown;
  onPaymentInsert?: (payload: Record<string, unknown>) => unknown;
  onDebtUpdate?: (payload: Record<string, unknown>) => void;
  onTxDelete?: () => void;
} = {}) {
  const debts = opts.debts ?? DEBTS;
  const payments = opts.payments ?? [];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "debts") return chainableTable(debts, { onUpdate: opts.onDebtUpdate });
        if (table === "debt_payments")
          return chainableTable(payments, {
            onInsert: (p) => opts.onPaymentInsert?.(p) ?? { id: "payment-1", ...p },
          });
        if (table === "transactions")
          return chainableTable([], {
            onInsert: (p) => opts.onTxInsert?.(p) ?? { id: "tx-1", ...p },
            onDelete: opts.onTxDelete,
          });
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
    mockSupabase({ debts: [DEBTS[0]] });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    await screen.findByText("Budi");
    fireEvent.click(screen.getByText("Piutang ke Aku"));

    expect(await screen.findByText("Gak ada data di filter ini.")).toBeInTheDocument();
  });

  it("shows the recurrence day instead of a due date for a recurring debt", async () => {
    mockSupabase({
      debts: [
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
      ],
    });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    expect(await screen.findByText("Berulang · tiap tanggal 20")).toBeInTheDocument();
    expect(screen.getByText("+ Bayar")).toBeInTheDocument();
    expect(screen.getByText("Tandai lunas")).toBeInTheDocument();
  });

  it("records a partial payment as a transaction and shows the remaining balance", async () => {
    const txInserts: Record<string, unknown>[] = [];
    const paymentInserts: Record<string, unknown>[] = [];
    mockSupabase({
      debts: [DEBTS[0]],
      onTxInsert: (p) => {
        txInserts.push(p);
        return { id: "tx-1", ...p };
      },
      onPaymentInsert: (p) => {
        paymentInserts.push(p);
        return { id: "payment-1", ...p };
      },
    });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    fireEvent.click(await screen.findByText("+ Bayar"));
    const input = screen.getByLabelText("Nominal pembayaran Budi");
    fireEvent.change(input, { target: { value: "150" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => expect(paymentInserts).toHaveLength(1));
    expect(txInserts[0]).toMatchObject({
      type: "expense",
      category: "Cicilan/Utang",
      amount: 150,
    });
    expect(paymentInserts[0]).toMatchObject({ debt_id: "d1", amount: 150, transaction_id: "tx-1" });
    expect(await screen.findByText(/Udah dibayar 150,00 € dari 450,00 €/)).toBeInTheDocument();
    // The big amount now shows what's left, not the original total -- it
    // also matches the totals card above, since that's the only debt.
    expect(screen.getAllByText("300,00 €")).toHaveLength(2);
  });

  it("checks the budget threshold after paying a debt the user owes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mockSupabase({ debts: [DEBTS[0]] });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    fireEvent.click(await screen.findByText("+ Bayar"));
    fireEvent.change(screen.getByLabelText("Nominal pembayaran Budi"), { target: { value: "150" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/keuangan/budget-alert-check",
        expect.objectContaining({ body: JSON.stringify({ category: "Cicilan/Utang" }) })
      )
    );
  });

  it("skips the budget-threshold check for a debt owed to the user (that's income, not expense)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    mockSupabase({ debts: [DEBTS[2]] }); // Sarah, owed_to_me
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    fireEvent.click(await screen.findByText("+ Bayar"));
    fireEvent.change(screen.getByLabelText("Nominal pembayaran Sarah"), { target: { value: "50" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => expect(screen.getByText(/Udah dibayar/)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalledWith("/api/keuangan/budget-alert-check", expect.anything());
  });

  it("auto-marks a debt as paid once payments cover the full amount", async () => {
    const debtUpdates: Record<string, unknown>[] = [];
    mockSupabase({
      debts: [DEBTS[0]],
      onDebtUpdate: (p) => debtUpdates.push(p),
    });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    fireEvent.click(await screen.findByText("+ Bayar"));
    fireEvent.change(screen.getByLabelText("Nominal pembayaran Budi"), { target: { value: "450" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => expect(debtUpdates).toContainEqual({ status: "paid" }));
    expect(await screen.findByText("LUNAS")).toBeInTheDocument();
  });

  it("tags a recurring debt's current-cycle payment and offers to undo it instead of paying again", async () => {
    mockSupabase({
      debts: [
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
      ],
      payments: [
        {
          id: "p1",
          debt_id: "d1",
          amount: 100,
          transaction_id: "tx-1",
          period: new Date().toISOString().slice(0, 7),
          paid_on: "2026-01-01",
          created_at: "2026-01-01",
        },
      ],
    });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    expect(await screen.findByText("BULAN INI LUNAS")).toBeInTheDocument();
    expect(screen.getByText("Batalkan")).toBeInTheDocument();
    expect(screen.queryByText("+ Bayar")).not.toBeInTheDocument();
  });

  it("undoing a payment deletes its transaction and removes the cycle tag", async () => {
    const deletedTx: string[] = [];
    mockSupabase({
      debts: [
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
      ],
      payments: [
        {
          id: "p1",
          debt_id: "d1",
          amount: 100,
          transaction_id: "tx-1",
          period: new Date().toISOString().slice(0, 7),
          paid_on: "2026-01-01",
          created_at: "2026-01-01",
        },
      ],
      onTxDelete: () => deletedTx.push("tx-1"),
    });
    const { default: DebtsTab } = await import("./DebtsTab");
    render(<DebtsTab />);

    fireEvent.click(await screen.findByText("Batalkan"));
    fireEvent.click(await screen.findByText("Ya, lanjut"));
    await waitFor(() => expect(screen.queryByText("BULAN INI LUNAS")).not.toBeInTheDocument());
    expect(deletedTx).toEqual(["tx-1"]);
    expect(screen.getByText("+ Bayar")).toBeInTheDocument();
  });
});

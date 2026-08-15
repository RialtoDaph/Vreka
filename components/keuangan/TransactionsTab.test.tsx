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

function chain(data: unknown[]) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    gte: () => obj,
    lte: () => obj,
    eq: () => obj,
    range: () => Promise.resolve({ data, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
  };
  return obj;
}

function mockSupabase({
  txRows = [] as unknown[],
  accountRows = [] as unknown[],
}: { txRows?: unknown[]; accountRows?: unknown[] } = {}) {
  const inserted: unknown[] = [];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "transactions") {
          return {
            select: () => chain(txRows),
            insert: (payload: unknown) => {
              inserted.push(payload);
              return Promise.resolve({ error: null });
            },
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
        }
        if (table === "accounts") {
          return { select: () => chain(accountRows) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));
  return { inserted };
}

describe("TransactionsTab", () => {
  it("shows the tagged account name, and 'Belum ditandain' when there's none", async () => {
    mockSupabase({
      txRows: [
        {
          id: "tx-1",
          category: "Makanan",
          description: null,
          amount: 50,
          type: "expense",
          occurred_on: "2026-08-01",
          receipt_path: null,
          account_id: "acc-1",
        },
        {
          id: "tx-2",
          category: "Gaji",
          description: null,
          amount: 1000,
          type: "income",
          occurred_on: "2026-08-01",
          receipt_path: null,
          account_id: null,
        },
      ],
      accountRows: [{ id: "acc-1", name: "BCA" }],
    });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    expect(await screen.findByText(/BCA/)).toBeInTheDocument();
    expect(screen.getByText(/Belum ditandain/)).toBeInTheDocument();
  });

  it("saves the selected account when submitting a new transaction", async () => {
    const { inserted } = mockSupabase({ accountRows: [{ id: "acc-1", name: "BCA" }] });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    await screen.findByText(/Belum ada transaksi/);
    fireEvent.click(screen.getByText("+ Catat Transaksi"));
    fireEvent.change(screen.getByLabelText("Jumlah (€)"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Rekening (opsional)"), { target: { value: "acc-1" } });
    fireEvent.click(screen.getByText("Simpan Transaksi"));

    await vi.waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({ account_id: "acc-1" });
  });

  it("saves a transfer with from/to accounts and no category picker", async () => {
    const { inserted } = mockSupabase({
      accountRows: [
        { id: "acc-1", name: "BCA" },
        { id: "acc-2", name: "Cash" },
      ],
    });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    await screen.findByText(/Belum ada transaksi/);
    fireEvent.click(screen.getByText("+ Catat Transaksi"));
    fireEvent.click(screen.getByText("Transfer"));

    expect(screen.queryByLabelText(/Kategori/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Jumlah (€)"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Dari Rekening"), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText("Ke Rekening"), { target: { value: "acc-2" } });
    fireEvent.click(screen.getByText("Simpan Transaksi"));

    await vi.waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0]).toMatchObject({
      type: "transfer",
      account_id: "acc-1",
      to_account_id: "acc-2",
    });
  });

  it("blocks submitting a transfer with the same source and destination account", async () => {
    const { inserted } = mockSupabase({ accountRows: [{ id: "acc-1", name: "BCA" }] });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    await screen.findByText(/Belum ada transaksi/);
    fireEvent.click(screen.getByText("+ Catat Transaksi"));
    fireEvent.click(screen.getByText("Transfer"));

    fireEvent.change(screen.getByLabelText("Jumlah (€)"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Dari Rekening"), { target: { value: "acc-1" } });
    fireEvent.change(screen.getByLabelText("Ke Rekening"), { target: { value: "acc-1" } });
    fireEvent.click(screen.getByText("Simpan Transaksi"));

    expect(await screen.findByText("Pilih rekening asal dan tujuan yang beda.")).toBeInTheDocument();
    expect(inserted).toHaveLength(0);
  });

  it("renders a transfer distinctly in the transaction list", async () => {
    mockSupabase({
      txRows: [
        {
          id: "tx-1",
          category: "Transfer",
          description: null,
          amount: 100,
          type: "transfer",
          occurred_on: "2026-08-01",
          receipt_path: null,
          account_id: "acc-1",
          to_account_id: "acc-2",
        },
      ],
      accountRows: [
        { id: "acc-1", name: "BCA" },
        { id: "acc-2", name: "Cash" },
      ],
    });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    expect(await screen.findByText("Transfer: BCA → Cash")).toBeInTheDocument();
  });

  it("excludes a transfer from the month summary's income/expense totals", async () => {
    mockSupabase({
      txRows: [
        {
          id: "tx-1",
          category: "Gaji",
          description: null,
          amount: 1000,
          type: "income",
          occurred_on: "2026-08-01",
          receipt_path: null,
          account_id: null,
        },
        {
          id: "tx-2",
          category: "Transfer",
          description: null,
          amount: 300,
          type: "transfer",
          occurred_on: "2026-08-01",
          receipt_path: null,
          account_id: "acc-1",
          to_account_id: "acc-2",
        },
      ],
    });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    await screen.findByText(/Gaji/);
    fireEvent.change(screen.getByLabelText("Lihat bulan"), { target: { value: "2026-08" } });

    // Saldo stays 1.000,00 -- would be 700,00 if the transfer leaked into
    // expense via the old bare `else` branch.
    const summary = await screen.findByText(/Pemasukan:/);
    expect(summary.closest("p")?.textContent).toMatch(/Saldo: 1\.000,00.€/);
  });

  it("shows a month summary and a reset button once a view month is picked", async () => {
    mockSupabase({
      txRows: [
        {
          id: "tx-1",
          category: "Gaji",
          description: null,
          amount: 1000,
          type: "income",
          occurred_on: "2026-08-01",
          receipt_path: null,
          account_id: null,
        },
      ],
    });
    const { default: TransactionsTab } = await import("./TransactionsTab");
    render(<TransactionsTab />);

    await screen.findByText(/Gaji/);
    fireEvent.change(screen.getByLabelText("Lihat bulan"), { target: { value: "2026-08" } });

    expect(await screen.findByText("Semua Bulan")).toBeInTheDocument();
    const summary = screen.getByText(/Pemasukan:/).closest("p");
    expect(summary?.textContent).toMatch(/Saldo: 1\.000,00.€/);
  });
});

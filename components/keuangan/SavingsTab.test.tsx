// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

const CASH_GOAL = {
  id: "g1",
  name: "Dana Darurat",
  target_amount: 5000,
  current_amount: 1000,
  deadline: null,
  asset_type: "cash",
  total_grams: 0,
  created_at: "2026-01-01",
};

const GOLD_GOAL = {
  id: "g2",
  name: "Emas Pensiun",
  target_amount: 20000,
  current_amount: 500,
  deadline: null,
  asset_type: "gold",
  total_grams: 10,
  created_at: "2026-01-01",
};

function chainableTable(
  rows: unknown[],
  opts: {
    onInsert?: (payload: Record<string, unknown>) => unknown;
    onUpdate?: (payload: Record<string, unknown>) => void;
  } = {}
) {
  let pendingResult: unknown = null;
  const obj: Record<string, unknown> = {
    select: () => obj,
    order: () => obj,
    eq: () => obj,
    update: (payload: Record<string, unknown>) => {
      opts.onUpdate?.(payload);
      pendingResult = null;
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
  goals?: unknown[];
  onInsert?: (payload: Record<string, unknown>) => unknown;
  onUpdate?: (payload: Record<string, unknown>) => void;
} = {}) {
  const goals = opts.goals ?? [CASH_GOAL];
  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      from: (table: string) => {
        if (table === "savings_goals")
          return chainableTable(goals, { onInsert: opts.onInsert, onUpdate: opts.onUpdate });
        throw new Error(`unexpected table: ${table}`);
      },
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    }),
  }));
}

describe("SavingsTab", () => {
  it("creates a gold-type goal with an initial gram amount", async () => {
    const inserts: Record<string, unknown>[] = [];
    mockSupabase({
      goals: [],
      onInsert: (p) => {
        inserts.push(p);
        return { id: "new-id", ...p };
      },
    });
    const { default: SavingsTab } = await import("./SavingsTab");
    render(<SavingsTab />);

    fireEvent.click(await screen.findByText("+ Target Baru"));
    fireEvent.change(screen.getByLabelText("Nama Target"), { target: { value: "Emas Pensiun" } });
    fireEvent.change(screen.getByLabelText("Target (€)"), { target: { value: "20.000" } });
    fireEvent.change(screen.getByLabelText("Jenis Target"), { target: { value: "gold" } });
    fireEvent.change(screen.getByLabelText("Sudah Punya (gram, opsional)"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Simpan Target"));

    await waitFor(() => expect(inserts).toHaveLength(1));
    expect(inserts[0]).toMatchObject({ asset_type: "gold", total_grams: 5, target_amount: 20000 });
  });

  it("buying gold adds to both current_amount and total_grams", async () => {
    const updates: Record<string, unknown>[] = [];
    mockSupabase({ goals: [GOLD_GOAL], onUpdate: (p) => updates.push(p) });
    const { default: SavingsTab } = await import("./SavingsTab");
    render(<SavingsTab />);

    fireEvent.click(await screen.findByText("+ Beli Emas"));
    fireEvent.change(screen.getByLabelText("Harga beli emas untuk Emas Pensiun"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByLabelText("Berat emas untuk Emas Pensiun"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => expect(updates).toContainEqual({ current_amount: 650, total_grams: 13 }));
  });

  it("shows the weighted average price per gram for a gold goal", async () => {
    mockSupabase({ goals: [GOLD_GOAL] });
    const { default: SavingsTab } = await import("./SavingsTab");
    render(<SavingsTab />);

    expect(await screen.findByText(/10 gram · rata-rata 50,00 €\/gram/)).toBeInTheDocument();
  });

  it("keeps the plain single-input Tambah Dana flow for a cash goal", async () => {
    const updates: Record<string, unknown>[] = [];
    mockSupabase({ goals: [CASH_GOAL], onUpdate: (p) => updates.push(p) });
    const { default: SavingsTab } = await import("./SavingsTab");
    render(<SavingsTab />);

    fireEvent.click(await screen.findByText("+ Tambah Dana"));
    expect(screen.queryByText("+ Beli Emas")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tambah dana ke Dana Darurat"), { target: { value: "200" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => expect(updates).toContainEqual({ current_amount: 1200 }));
  });
});

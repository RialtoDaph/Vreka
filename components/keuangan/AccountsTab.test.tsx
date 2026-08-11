// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockSupabase(accountRows: unknown[], txRows: unknown[]) {
  const updates: Array<{ table: string; payload: unknown }> = [];
  const inserted: Array<{ table: string; payload: unknown }> = [];

  vi.doMock("@/lib/supabase/client", () => ({
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from: (table: string) => {
        if (table === "accounts") {
          const obj: Record<string, unknown> = {
            select: () => ({ order: () => Promise.resolve({ data: accountRows, error: null }) }),
            insert: (payload: unknown) => {
              inserted.push({ table, payload });
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: "new-acc" }, error: null }),
                }),
              };
            },
            update: (payload: unknown) => {
              updates.push({ table, payload });
              const chain: Record<string, unknown> = {
                eq: () => chain,
                neq: () => Promise.resolve({ error: null }),
                then: (resolve: (v: unknown) => unknown) =>
                  Promise.resolve({ error: null }).then(resolve),
              };
              return chain;
            },
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          };
          return obj;
        }
        if (table === "transactions") {
          return { select: () => Promise.resolve({ data: txRows, error: null }) };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));

  return { updates, inserted };
}

describe("AccountsTab", () => {
  it("shows each account's balance as starting balance plus its net transactions", async () => {
    mockSupabase(
      [
        {
          id: "acc-1",
          user_id: "user-1",
          name: "BCA",
          starting_balance: 1000,
          is_primary: true,
          created_at: "2026-01-01",
        },
      ],
      [
        { account_id: "acc-1", type: "income", amount: 500 },
        { account_id: "acc-1", type: "expense", amount: 200 },
      ]
    );
    const { default: AccountsTab } = await import("./AccountsTab");
    render(<AccountsTab />);

    expect(await screen.findByText("BCA")).toBeInTheDocument();
    expect(screen.getByText("Utama")).toBeInTheDocument();
    expect(screen.getByText("1.300,00 €")).toBeInTheDocument();
  });

  it("shows the empty-state message when there are no accounts yet", async () => {
    mockSupabase([], []);
    const { default: AccountsTab } = await import("./AccountsTab");
    render(<AccountsTab />);

    expect(
      await screen.findByText(/Belum ada rekening\./)
    ).toBeInTheDocument();
  });

  it("hints at unassigned transaction totals without attributing them to any account", async () => {
    mockSupabase(
      [{ id: "acc-1", user_id: "user-1", name: "BCA", starting_balance: 0, is_primary: true, created_at: "2026-01-01" }],
      [{ account_id: null, type: "expense", amount: 50 }]
    );
    const { default: AccountsTab } = await import("./AccountsTab");
    render(<AccountsTab />);

    await screen.findByText("BCA");
    expect(screen.getByText(/belum ditandain rekeningnya/)).toBeInTheDocument();
  });

  it("defaults the primary checkbox to checked when adding the very first account", async () => {
    const { updates, inserted } = mockSupabase([], []);
    const { default: AccountsTab } = await import("./AccountsTab");
    render(<AccountsTab />);

    await screen.findByText(/Belum ada rekening\./);
    fireEvent.click(screen.getByText("+ Rekening Baru"));

    const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Nama Rekening"), { target: { value: "Cash" } });
    fireEvent.click(screen.getByText("Simpan Rekening"));

    await vi.waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].payload).toMatchObject({ user_id: "user-1", name: "Cash", is_primary: false });
    await vi.waitFor(() =>
      expect(updates.some((u) => (u.payload as { is_primary?: boolean }).is_primary === true)).toBe(true)
    );
  });
});

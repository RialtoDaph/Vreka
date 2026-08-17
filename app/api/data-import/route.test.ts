import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/data-import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  return { auth: { getUser: async () => ({ data: { user } }) } };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/data-import", () => {
  it("rejects unauthenticated requests", async () => {
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => mockAuth(null) }));
    const { POST } = await import("./route");
    const res = await POST(req({ data: {} }));
    expect(res.status).toBe(401);
  });

  it("rejects a body without a data object", async () => {
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => mockAuth({ id: "user-1" }) }));
    const { POST } = await import("./route");
    const res = await POST(req({ exported_at: "2026-01-01" }));
    expect(res.status).toBe(400);
  });

  it("upserts each table's rows forcing the current user's id as owner", async () => {
    const upsertCalls: { table: string; rows: Record<string, unknown>[] }[] = [];
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: (table: string) => ({
          upsert: (rows: Record<string, unknown>[]) => {
            upsertCalls.push({ table, rows });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }));
    const { POST } = await import("./route");
    const res = await POST(
      req({
        data: {
          accounts: [{ id: "acc-1", user_id: "someone-else", name: "Cash", starting_balance: 100 }],
          tasks: [{ id: "task-1", user_id: "someone-else", title: "Bayar listrik" }],
        },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.accounts).toEqual({ imported: 1 });
    expect(body.results.tasks).toEqual({ imported: 1 });
    // Every table the import route knows about gets a result, even ones
    // absent from this particular export file.
    expect(body.results.transactions).toEqual({ imported: 0 });

    const accountsCall = upsertCalls.find((c) => c.table === "accounts");
    expect(accountsCall?.rows[0].user_id).toBe("user-1");
    const tasksCall = upsertCalls.find((c) => c.table === "tasks");
    expect(tasksCall?.rows[0].user_id).toBe("user-1");
  });

  it("imports accounts before transactions so account_id foreign keys resolve", async () => {
    const order: string[] = [];
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: (table: string) => ({
          upsert: () => {
            order.push(table);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }));
    const { POST } = await import("./route");
    await POST(
      req({
        data: {
          transactions: [{ id: "tx-1", account_id: "acc-1" }],
          accounts: [{ id: "acc-1", name: "Cash" }],
        },
      })
    );

    expect(order.indexOf("accounts")).toBeLessThan(order.indexOf("transactions"));
  });

  it("records a per-table error and keeps importing the rest", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: (table: string) => ({
          upsert: () => {
            if (table === "accounts") return Promise.resolve({ error: { message: "boom" } });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }));
    const { POST } = await import("./route");
    const res = await POST(
      req({
        data: {
          accounts: [{ id: "acc-1", name: "Cash" }],
          tasks: [{ id: "task-1", title: "Bayar listrik" }],
        },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.accounts).toEqual({ imported: 0, error: "boom" });
    expect(body.results.tasks).toEqual({ imported: 1 });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

type Row = Record<string, unknown>;

// Minimal Supabase query-builder double: supports the .select/.eq/.ilike
// chain findOneByColumn() uses, plus insert()/update()/delete() as thenables
// that actually mutate the in-memory table so a find-then-write flow
// (e.g. update_debt) sees its own effect.
function makeSupabase(tables: Record<string, Row[]>) {
  const inserted: { table: string; payload: Row }[] = [];
  const updated: { table: string; payload: Row }[] = [];
  const deleted: { table: string; id: unknown }[] = [];

  function builder(table: string) {
    let pendingOp: "update" | "delete" | null = null;
    let pendingPayload: Row = {};
    const filters: ((r: Row) => boolean)[] = [];

    const obj: Record<string, unknown> = {
      select: () => obj,
      insert: (payload: Row) => {
        inserted.push({ table, payload });
        tables[table] = [...(tables[table] ?? []), { id: `new-${(tables[table]?.length ?? 0) + 1}`, ...payload }];
        return Promise.resolve({ error: null });
      },
      update: (payload: Row) => {
        pendingOp = "update";
        pendingPayload = payload;
        return obj;
      },
      delete: () => {
        pendingOp = "delete";
        return obj;
      },
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return obj;
      },
      ilike: (col: string, pattern: string) => {
        const needle = String(pattern).replace(/%/g, "").toLowerCase();
        filters.push((r) => String(r[col] ?? "").toLowerCase().includes(needle));
        return obj;
      },
      limit: () => obj,
      order: () => obj,
      then: (resolve: (v: { data?: Row[]; error: null }) => unknown) => {
        const rows = tables[table] ?? [];
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (pendingOp === "update") {
          updated.push({ table, payload: pendingPayload });
          tables[table] = rows.map((r) => (filters.every((f) => f(r)) ? { ...r, ...pendingPayload } : r));
          return Promise.resolve({ error: null }).then(resolve);
        }
        if (pendingOp === "delete") {
          if (matched[0]) deleted.push({ table, id: matched[0].id });
          tables[table] = rows.filter((r) => !filters.every((f) => f(r)));
          return Promise.resolve({ error: null }).then(resolve);
        }
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      },
    };
    return obj;
  }

  return { inserted, updated, deleted, tables, from: (table: string) => builder(table) };
}

describe("executeAssistantTool: search_records", () => {
  it("rejects an empty query", async () => {
    vi.doMock("@/lib/search", () => ({ searchAll: vi.fn() }));
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_records", { query: "" });
    expect(res).toEqual({ ok: false, result: "query kosong." });
  });

  it("reports when nothing matches", async () => {
    vi.doMock("@/lib/search", () => ({ searchAll: vi.fn().mockResolvedValue([]) }));
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_records", { query: "zzz" });
    expect(res).toEqual({ ok: true, result: 'Nggak nemu apa-apa buat "zzz".' });
  });

  it("formats matches with a source label per line", async () => {
    const searchAll = vi.fn().mockResolvedValue([
      { source: "task", id: "t1", title: "Bayar listrik", snippet: "todo", date: "2026-08-01", href: "/dashboard/kerjaan" },
      {
        source: "transaction",
        id: "tx1",
        title: "Makan — Nasi goreng",
        snippet: "25,00 € · 1 Agu 2026",
        date: "2026-08-01",
        href: "/dashboard/keuangan",
      },
    ]);
    vi.doMock("@/lib/search", () => ({ searchAll }));
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_records", { query: "listrik" });

    expect(searchAll).toHaveBeenCalledWith({}, "user-1", "listrik", 5);
    expect(res.ok).toBe(true);
    expect(res.result).toBe(
      "- [To-do] Bayar listrik — todo\n- [Transaksi] Makan — Nasi goreng — 25,00 € · 1 Agu 2026"
    );
  });
});

describe("executeAssistantTool: debts", () => {
  it("adds a debt with a valid amount", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ debts: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_debt", {
      party_name: "Budi",
      direction: "i_owe",
      amount: 500,
    });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0]).toMatchObject({
      table: "debts",
      payload: { user_id: "user-1", party_name: "Budi", direction: "i_owe", amount: 500 },
    });
  });

  it("rejects a non-positive amount", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ debts: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_debt", {
      party_name: "Budi",
      direction: "i_owe",
      amount: 0,
    });
    expect(res).toEqual({ ok: false, result: "amount harus > 0." });
  });

  it("marks a debt paid by party name", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      debts: [{ id: "d1", user_id: "user-1", party_name: "Budi", status: "unpaid" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "update_debt", {
      party_query: "budi",
      new_status: "paid",
    });
    expect(res.ok).toBe(true);
    expect(supabase.updated[0]).toMatchObject({ table: "debts", payload: { status: "paid" } });
  });

  it("deletes a debt found by party name", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      debts: [{ id: "d1", user_id: "user-1", party_name: "Budi" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_debt", {
      party_query: "budi",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "debts", id: "d1" }]);
  });
});

describe("executeAssistantTool: savings goals", () => {
  it("creates a goal with zero current_amount", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ savings_goals: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_savings_goal", {
      name: "Dana darurat",
      target_amount: 10000,
    });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0].payload).toMatchObject({
      name: "Dana darurat",
      target_amount: 10000,
      current_amount: 0,
    });
  });

  it("updates saved progress found by name", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      savings_goals: [{ id: "g1", user_id: "user-1", name: "Dana darurat", current_amount: 1000 }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "update_savings_goal", {
      title_query: "dana darurat",
      new_current_amount: 2500,
    });
    expect(res.ok).toBe(true);
    expect(supabase.updated[0].payload).toEqual({ current_amount: 2500 });
  });

  it("deletes a savings goal found by name", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      savings_goals: [{ id: "g1", user_id: "user-1", name: "Dana darurat" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_savings_goal", {
      title_query: "dana darurat",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "savings_goals", id: "g1" }]);
  });
});

describe("executeAssistantTool: recurring items", () => {
  it("adds a recurring item, clamping an out-of-range day_of_month to null", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ recurring_items: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_recurring_item", {
      type: "expense",
      name: "Netflix",
      category: "Hiburan",
      amount: 15,
      day_of_month: 40,
    });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0].payload).toMatchObject({ name: "Netflix", amount: 15, day_of_month: null });
  });

  it("deletes a recurring item found by name", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      recurring_items: [{ id: "r1", user_id: "user-1", name: "Netflix" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_recurring_item", {
      name_query: "netflix",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "recurring_items", id: "r1" }]);
  });
});

describe("executeAssistantTool: life milestones", () => {
  it("adds a milestone, defaulting an invalid category to lainnya", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ life_milestones: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_milestone", {
      title: "Wisuda S1",
      category: "not-a-real-category",
      occurred_on: "2023-06-01",
    });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0].payload).toMatchObject({
      title: "Wisuda S1",
      category: "lainnya",
      occurred_on: "2023-06-01",
      ended_on: null,
    });
  });

  it("updates a milestone's end date, found by title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      life_milestones: [{ id: "m1", user_id: "user-1", title: "Kuliah S1", occurred_on: "2018-08-01" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "update_milestone", {
      title_query: "kuliah",
      new_ended_on: "2022-06-01",
    });
    expect(res.ok).toBe(true);
    expect(supabase.updated[0].payload).toEqual({ ended_on: "2022-06-01" });
  });

  it("deletes a milestone found by title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      life_milestones: [{ id: "m1", user_id: "user-1", title: "Wisuda S1" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_milestone", {
      title_query: "wisuda",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "life_milestones", id: "m1" }]);
  });

  it("reports when no milestone matches the query", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ life_milestones: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_milestone", {
      title_query: "nggak ada",
    });
    expect(res.ok).toBe(false);
    expect(res.result).toContain("Nggak nemu");
  });
});

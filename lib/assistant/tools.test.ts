import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

type Row = Record<string, unknown>;

// Minimal Supabase query-builder double: supports the .select/.eq/.ilike
// chain findOneByColumn() uses, plus insert()/update()/delete()/upsert() as
// thenables and maybeSingle() as a terminal, all mutating the in-memory
// table so a find-then-write flow (e.g. update_debt, toggle_habit) sees its
// own effect.
function makeSupabase(tables: Record<string, Row[]>) {
  const inserted: { table: string; payload: Row }[] = [];
  const updated: { table: string; payload: Row }[] = [];
  const deleted: { table: string; id: unknown }[] = [];
  const upserted: { table: string; payload: Row }[] = [];

  function builder(table: string) {
    let pendingOp: "update" | "delete" | null = null;
    let pendingPayload: Row = {};
    const filters: ((r: Row) => boolean)[] = [];

    const obj: Record<string, unknown> = {
      select: () => obj,
      insert: (payload: Row) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          inserted.push({ table, payload: row });
          tables[table] = [...(tables[table] ?? []), { id: `new-${(tables[table]?.length ?? 0) + 1}`, ...row }];
        }
        return Promise.resolve({ error: null });
      },
      upsert: (payload: Row, opts?: { onConflict?: string }) => {
        upserted.push({ table, payload });
        const rows = tables[table] ?? [];
        const conflictCols = (opts?.onConflict ?? "").split(",").filter(Boolean);
        const existing = conflictCols.length
          ? rows.find((r) => conflictCols.every((c) => r[c] === payload[c]))
          : undefined;
        tables[table] = existing
          ? rows.map((r) => (r === existing ? { ...r, ...payload } : r))
          : [...rows, { id: `new-${rows.length + 1}`, ...payload }];
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
      maybeSingle: () => {
        const rows = tables[table] ?? [];
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
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

  return { inserted, updated, deleted, upserted, tables, from: (table: string) => builder(table) };
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

describe("executeAssistantTool: memory", () => {
  it("remembers a fact", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ assistant_memories: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "remember", {
      content: "Suka kopi item.",
    });
    expect(res).toEqual({ ok: true, result: "Tersimpan." });
    expect(supabase.inserted[0]).toMatchObject({
      table: "assistant_memories",
      payload: { user_id: "user-1", content: "Suka kopi item." },
    });
  });

  it("rejects an empty fact", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ assistant_memories: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "remember", { content: "  " });
    expect(res).toEqual({ ok: false, result: "content kosong." });
  });

  it("forgets a memory found by query", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      assistant_memories: [{ id: "m1", user_id: "user-1", content: "Suka kopi item." }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "forget", { query: "kopi" });
    expect(res).toEqual({ ok: true, result: "Memory dihapus." });
    expect(supabase.deleted).toEqual([{ table: "assistant_memories", id: "m1" }]);
  });

  it("reports ambiguity when several memories match", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      assistant_memories: [
        { id: "m1", user_id: "user-1", content: "Suka kopi item." },
        { id: "m2", user_id: "user-1", content: "Suka kopi susu." },
      ],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "forget", { query: "kopi" });
    expect(res.ok).toBe(false);
    expect(res.result).toContain("Ada 2 memory");
  });
});

describe("executeAssistantTool: transactions", () => {
  it("adds a transaction, defaulting occurred_on to today", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ transactions: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_transaction", {
      type: "expense",
      category: "Makanan",
      amount: 25,
    });
    expect(res.ok).toBe(true);
    const payload = supabase.inserted[0].payload;
    expect(payload).toMatchObject({ type: "expense", category: "Makanan", amount: 25 });
    expect(payload.occurred_on).toBe(new Date().toISOString().slice(0, 10));
  });

  it("rejects a non-positive amount", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ transactions: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_transaction", {
      type: "expense",
      category: "Makanan",
      amount: -5,
    });
    expect(res).toEqual({ ok: false, result: "amount harus > 0." });
  });

  it("checks the budget threshold after adding an expense, but not an income", async () => {
    const checkBudgetAlertAndNotify = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/budgetAlerts", () => ({ checkBudgetAlertAndNotify }));
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ transactions: [] });

    await executeAssistantTool(supabase as never, "user-1", "add_transaction", {
      type: "expense",
      category: "Makanan",
      amount: 25,
    });
    expect(checkBudgetAlertAndNotify).toHaveBeenCalledWith(supabase, "user-1", "Makanan");

    checkBudgetAlertAndNotify.mockClear();
    await executeAssistantTool(supabase as never, "user-1", "add_transaction", {
      type: "income",
      category: "Gaji",
      amount: 5000,
    });
    expect(checkBudgetAlertAndNotify).not.toHaveBeenCalled();
  });

  it("deletes a transaction found by category or description", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      transactions: [
        { id: "t1", user_id: "user-1", category: "Makanan", description: "Nasi goreng", amount: 25 },
      ],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_transaction", {
      query: "nasi goreng",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "transactions", id: "t1" }]);
  });

  it("reports when several transactions match the query", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      transactions: [
        { id: "t1", user_id: "user-1", category: "Makanan", description: "Nasi goreng", amount: 25 },
        { id: "t2", user_id: "user-1", category: "Makanan", description: "Nasi padang", amount: 30 },
      ],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_transaction", {
      query: "makanan",
    });
    expect(res.ok).toBe(false);
    expect(res.result).toContain("Ada 2 transaksi");
  });
});

describe("executeAssistantTool: tasks", () => {
  it("adds a task, defaulting priority to medium", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ tasks: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_task", { title: "Bayar listrik" });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0].payload).toMatchObject({
      title: "Bayar listrik",
      priority: "medium",
      status: "todo",
    });
  });

  it("rejects an empty title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ tasks: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_task", { title: "  " });
    expect(res).toEqual({ ok: false, result: "title kosong." });
  });

  it("updates a task found by title, only patching fields that were given", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      tasks: [{ id: "t1", user_id: "user-1", title: "Bayar listrik", priority: "medium", status: "todo" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "update_task", {
      title_query: "listrik",
      new_status: "done",
    });
    expect(res.ok).toBe(true);
    expect(supabase.updated[0].payload).toEqual({ status: "done" });
  });

  it("rejects an update with no recognized fields", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      tasks: [{ id: "t1", user_id: "user-1", title: "Bayar listrik" }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "update_task", {
      title_query: "listrik",
    });
    expect(res).toEqual({ ok: false, result: "Nggak ada perubahan yang disebutin." });
  });

  it("deletes a task found by title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ tasks: [{ id: "t1", user_id: "user-1", title: "Bayar listrik" }] });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_task", { title_query: "listrik" });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "tasks", id: "t1" }]);
  });

  it("adds a sub-task to a task found by title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      tasks: [{ id: "t1", user_id: "user-1", title: "Bayar listrik" }],
      task_subtasks: [],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_subtask", {
      title_query: "listrik",
      subtask_title: "Cek tagihan",
    });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0]).toMatchObject({
      table: "task_subtasks",
      payload: { task_id: "t1", title: "Cek tagihan" },
    });
  });

  it("toggles a sub-task found under its parent task", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      tasks: [{ id: "t1", user_id: "user-1", title: "Bayar listrik" }],
      task_subtasks: [{ id: "s1", task_id: "t1", user_id: "user-1", title: "Cek tagihan", done: false }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "toggle_subtask", {
      title_query: "listrik",
      subtask_query: "cek tagihan",
      done: true,
    });
    expect(res.ok).toBe(true);
    expect(supabase.updated[0]).toMatchObject({ table: "task_subtasks", payload: { done: true } });
  });

  it("reports when the sub-task query doesn't match anything under that task", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      tasks: [{ id: "t1", user_id: "user-1", title: "Bayar listrik" }],
      task_subtasks: [{ id: "s1", task_id: "t1", user_id: "user-1", title: "Cek tagihan", done: false }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "toggle_subtask", {
      title_query: "listrik",
      subtask_query: "nggak ada",
      done: true,
    });
    expect(res.ok).toBe(false);
    expect(res.result).toContain("Nggak nemu sub-task");
  });
});

describe("executeAssistantTool: study notes", () => {
  it("adds a study note, clamping progress into 0-100", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ study_notes: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_study_note", {
      title: "Kalkulus II",
      progress: 150,
    });
    expect(res.ok).toBe(true);
    expect(supabase.inserted[0].payload).toMatchObject({ title: "Kalkulus II", progress: 100 });
  });

  it("updates a study note's progress found by title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      study_notes: [{ id: "n1", user_id: "user-1", title: "Kalkulus II", progress: 40 }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "update_study_note", {
      title_query: "kalkulus",
      new_progress: 80,
    });
    expect(res.ok).toBe(true);
    expect(supabase.updated[0].payload).toEqual({ progress: 80 });
  });

  it("deletes a study note found by title", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ study_notes: [{ id: "n1", user_id: "user-1", title: "Kalkulus II" }] });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_study_note", {
      title_query: "kalkulus",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "study_notes", id: "n1" }]);
  });
});

describe("executeAssistantTool: budgets", () => {
  it("creates a new budget via upsert when the category has none yet", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ budgets: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "set_budget", {
      category: "Makanan",
      monthly_limit: 500,
    });
    expect(res.ok).toBe(true);
    expect(supabase.upserted[0].payload).toEqual({
      user_id: "user-1",
      category: "Makanan",
      monthly_limit: 500,
    });
  });

  it("rejects a non-positive monthly_limit", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ budgets: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "set_budget", {
      category: "Makanan",
      monthly_limit: 0,
    });
    expect(res).toEqual({ ok: false, result: "monthly_limit harus > 0." });
  });

  it("deletes a budget by category", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      budgets: [{ id: "b1", user_id: "user-1", category: "Makanan", monthly_limit: 500 }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "delete_budget", {
      category: "Makanan",
    });
    expect(res.ok).toBe(true);
    expect(supabase.deleted).toEqual([{ table: "budgets", id: "b1" }]);
  });
});

describe("executeAssistantTool: habits", () => {
  it("checks off a habit not yet done today", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      habits: [{ id: "h1", user_id: "user-1", title: "Olahraga" }],
      habit_checks: [],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "toggle_habit", {
      title_query: "olahraga",
    });
    expect(res.ok).toBe(true);
    expect(res.result).toContain("ditandain selesai");
    expect(supabase.inserted[0]).toMatchObject({ table: "habit_checks", payload: { habit_id: "h1" } });
  });

  it("no-ops when the habit is already checked today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      habits: [{ id: "h1", user_id: "user-1", title: "Olahraga" }],
      habit_checks: [{ id: "c1", habit_id: "h1", period: today }],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "toggle_habit", {
      title_query: "olahraga",
    });
    expect(res.ok).toBe(true);
    expect(res.result).toContain("udah dicentang hari ini");
    expect(supabase.inserted).toHaveLength(0);
  });
});

describe("executeAssistantTool: journal", () => {
  it("starts today's journal entry when there isn't one yet", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ journal_entries: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_journal_entry", {
      content: "Hari yang produktif.",
    });
    expect(res.ok).toBe(true);
    expect(supabase.upserted[0].payload).toMatchObject({ content: "Hari yang produktif." });
  });

  it("appends to today's existing entry instead of overwriting it", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({
      journal_entries: [
        { id: "j1", user_id: "user-1", entry_date: today, content: "Pagi ini lari." },
      ],
    });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_journal_entry", {
      content: "Sore ini belajar.",
    });
    expect(res.ok).toBe(true);
    expect(supabase.upserted[0].payload.content).toBe("Pagi ini lari.\n\nSore ini belajar.");
  });

  it("rejects empty content", async () => {
    const { executeAssistantTool } = await import("./tools");
    const supabase = makeSupabase({ journal_entries: [] });
    const res = await executeAssistantTool(supabase as never, "user-1", "add_journal_entry", { content: "  " });
    expect(res).toEqual({ ok: false, result: "content kosong." });
  });
});

describe("executeAssistantTool: Gmail", () => {
  function mockGmail({
    accessToken = "token-1",
    messages = [],
    getMessageResult,
  }: {
    accessToken?: string | null;
    messages?: { id: string }[];
    getMessageResult?: (id: string) => Record<string, unknown>;
  }) {
    vi.doMock("@/lib/google/credentials", () => ({
      getGmailAccessToken: vi.fn().mockResolvedValue(accessToken),
      getCalendarAccessToken: vi.fn(),
    }));
    vi.doMock("@/lib/google/gmail", () => ({
      listMessages: vi.fn().mockResolvedValue(messages),
      getMessage: vi.fn().mockImplementation(async (_token: string, id: string) =>
        getMessageResult
          ? getMessageResult(id)
          : { id, subject: "Subjek", from: "a@b.com", date: "2026-08-01", snippet: "cuplikan", bodyText: "isi" }
      ),
      createDraftReply: vi.fn().mockResolvedValue({}),
    }));
  }

  it("search_email reports when Gmail isn't connected", async () => {
    mockGmail({ accessToken: null });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_email", { query: "invoice" });
    expect(res.ok).toBe(false);
    expect(res.result).toContain("Gmail belum di-connect");
  });

  it("search_email summarizes matches wrapped in the untrusted-data note", async () => {
    mockGmail({ messages: [{ id: "m1" }] });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "search_email", { query: "invoice" });
    expect(res.ok).toBe(true);
    expect(res.result).toContain("DATA EMAIL DARI LUAR");
    expect(res.result).toContain("Subjek");
  });

  it("read_email returns the full body for a single match", async () => {
    mockGmail({ messages: [{ id: "m1" }] });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "read_email", { query: "invoice" });
    expect(res.ok).toBe(true);
    expect(res.result).toContain("isi");
  });

  it("read_email asks for clarification when multiple emails match", async () => {
    mockGmail({
      messages: [{ id: "m1" }, { id: "m2" }],
      getMessageResult: (id) => ({ id, subject: `Subjek ${id}`, from: "a@b.com", date: "2026-08-01", snippet: "" }),
    });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "read_email", { query: "invoice" });
    expect(res.ok).toBe(false);
    expect(res.result).toContain("Ada 2 email");
  });

  it("draft_email_reply rejects an empty body", async () => {
    mockGmail({ messages: [{ id: "m1" }] });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "draft_email_reply", {
      query: "invoice",
      body: "  ",
    });
    expect(res).toEqual({ ok: false, result: "Isi balesan kosong." });
  });

  it("draft_email_reply creates a draft for a single match", async () => {
    mockGmail({ messages: [{ id: "m1" }] });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "draft_email_reply", {
      query: "invoice",
      body: "Sip, ditransfer sore ini.",
    });
    expect(res.ok).toBe(true);
    expect(res.result).toContain("Draft balesan");
  });
});

describe("executeAssistantTool: Google Calendar", () => {
  function mockCalendar({
    cred = { accessToken: "token-1" } as { accessToken: string } | { error: string },
    events = [],
    createEventImpl,
  }: {
    cred?: { accessToken: string } | { error: string };
    events?: { summary: string; start: string; location: string | null }[];
    createEventImpl?: ReturnType<typeof vi.fn>;
  } = {}) {
    vi.doMock("@/lib/google/credentials", () => ({
      getGmailAccessToken: vi.fn(),
      getCalendarAccessToken: vi.fn().mockResolvedValue(cred),
    }));
    vi.doMock("@/lib/google/calendar", () => ({
      listUpcomingEvents: vi.fn().mockResolvedValue(events),
      createEvent: createEventImpl ?? vi.fn().mockResolvedValue({}),
    }));
  }

  it("check_calendar reports the connection error when Calendar isn't linked", async () => {
    mockCalendar({ cred: { error: "Google Calendar belum di-connect." } });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "check_calendar", {});
    expect(res).toEqual({ ok: false, result: "Google Calendar belum di-connect." });
  });

  it("check_calendar lists upcoming events", async () => {
    mockCalendar({ events: [{ summary: "Standup", start: "2026-08-05T09:00:00Z", location: null }] });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "check_calendar", { days_ahead: 3 });
    expect(res.ok).toBe(true);
    expect(res.result).toContain("Standup");
  });

  it("check_calendar reports an empty range plainly", async () => {
    mockCalendar({ events: [] });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "check_calendar", {});
    expect(res).toEqual({ ok: true, result: "Nggak ada event di rentang waktu itu." });
  });

  it("add_calendar_event rejects missing required fields", async () => {
    mockCalendar();
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "add_calendar_event", {
      summary: "Meeting",
    });
    expect(res).toEqual({ ok: false, result: "summary/start/end kosong." });
  });

  it("add_calendar_event creates the event via the Calendar client", async () => {
    const createEventImpl = vi.fn().mockResolvedValue({});
    mockCalendar({ createEventImpl });
    const { executeAssistantTool } = await import("./tools");
    const res = await executeAssistantTool({} as never, "user-1", "add_calendar_event", {
      summary: "Meeting",
      start: "2026-08-05T14:00:00+02:00",
      end: "2026-08-05T15:00:00+02:00",
    });
    expect(res.ok).toBe(true);
    expect(createEventImpl).toHaveBeenCalledWith(
      "token-1",
      expect.objectContaining({ summary: "Meeting" })
    );
  });
});

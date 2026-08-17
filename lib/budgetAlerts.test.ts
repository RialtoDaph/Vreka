import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateBudgetAlert } from "./budgetAlerts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("evaluateBudgetAlert", () => {
  it("returns no level under 90%", () => {
    expect(evaluateBudgetAlert(80, 100)).toEqual({ pct: 80, level: null });
  });

  it("returns warn at 90% and just under 100%", () => {
    expect(evaluateBudgetAlert(90, 100)).toEqual({ pct: 90, level: "warn" });
    expect(evaluateBudgetAlert(99, 100)).toEqual({ pct: 99, level: "warn" });
  });

  it("returns over at exactly 100% and beyond", () => {
    expect(evaluateBudgetAlert(100, 100)).toEqual({ pct: 100, level: "over" });
    expect(evaluateBudgetAlert(150, 100)).toEqual({ pct: 150, level: "over" });
  });

  it("treats a zero or missing limit as no alert rather than dividing by zero", () => {
    expect(evaluateBudgetAlert(500, 0)).toEqual({ pct: 0, level: null });
  });
});

type Row = Record<string, unknown>;

function makeSupabase(tables: Record<string, Row[]>) {
  const inserted: { table: string; payload: Row }[] = [];

  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const obj: Record<string, unknown> = {
      select: () => obj,
      eq: (col: string, val: unknown) => {
        filters.push((r) => r[col] === val);
        return obj;
      },
      gte: () => obj,
      insert: (payload: Row) => {
        const rows = tables[table] ?? [];
        const conflict = rows.some(
          (r) => r.user_id === payload.user_id && r.category === payload.category && r.month === payload.month && r.level === payload.level
        );
        if (conflict) return Promise.resolve({ error: { code: "23505", message: "duplicate" } });
        inserted.push({ table, payload });
        tables[table] = [...rows, payload];
        return Promise.resolve({ error: null });
      },
      maybeSingle: () => {
        const rows = tables[table] ?? [];
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: matched[0] ?? null, error: null });
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => {
        const rows = tables[table] ?? [];
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      },
    };
    return obj;
  }

  return { inserted, from: (table: string) => builder(table) };
}

describe("checkBudgetAlertAndNotify", () => {
  const thisMonthDay = new Date().toISOString().slice(0, 10);

  it("does nothing when the category has no budget set", async () => {
    const sendPushToUser = vi.fn();
    vi.doMock("@/lib/push", () => ({ sendPushToUser }));
    const { checkBudgetAlertAndNotify } = await import("./budgetAlerts");
    const supabase = makeSupabase({ budgets: [], transactions: [] });

    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("does nothing when spend is under 90% of the budget", async () => {
    const sendPushToUser = vi.fn();
    vi.doMock("@/lib/push", () => ({ sendPushToUser }));
    const { checkBudgetAlertAndNotify } = await import("./budgetAlerts");
    const supabase = makeSupabase({
      budgets: [{ user_id: "user-1", category: "Makanan", monthly_limit: 1000 }],
      transactions: [
        { user_id: "user-1", type: "expense", category: "Makanan", amount: 500, occurred_on: thisMonthDay },
      ],
    });

    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");
    expect(sendPushToUser).not.toHaveBeenCalled();
  });

  it("sends a push and logs the alert when spend crosses 90%", async () => {
    const sendPushToUser = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    vi.doMock("@/lib/push", () => ({ sendPushToUser }));
    const { checkBudgetAlertAndNotify } = await import("./budgetAlerts");
    const supabase = makeSupabase({
      budgets: [{ user_id: "user-1", category: "Makanan", monthly_limit: 1000 }],
      transactions: [
        { user_id: "user-1", type: "expense", category: "Makanan", amount: 950, occurred_on: thisMonthDay },
      ],
      budget_alert_log: [],
    });

    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");

    expect(sendPushToUser).toHaveBeenCalledTimes(1);
    expect(sendPushToUser).toHaveBeenCalledWith(
      supabase,
      "user-1",
      expect.objectContaining({ title: "⚠️ Anggaran hampir jebol" })
    );
    expect(supabase.inserted).toHaveLength(1);
  });

  it("uses the 'kebobolan' wording once spend hits 100%+", async () => {
    const sendPushToUser = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    vi.doMock("@/lib/push", () => ({ sendPushToUser }));
    const { checkBudgetAlertAndNotify } = await import("./budgetAlerts");
    const supabase = makeSupabase({
      budgets: [{ user_id: "user-1", category: "Makanan", monthly_limit: 1000 }],
      transactions: [
        { user_id: "user-1", type: "expense", category: "Makanan", amount: 1200, occurred_on: thisMonthDay },
      ],
      budget_alert_log: [],
    });

    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");
    expect(sendPushToUser).toHaveBeenCalledWith(
      supabase,
      "user-1",
      expect.objectContaining({ title: "🚨 Anggaran kebobolan" })
    );
  });

  it("only pushes once per category/level/month even if called again", async () => {
    const sendPushToUser = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    vi.doMock("@/lib/push", () => ({ sendPushToUser }));
    const { checkBudgetAlertAndNotify } = await import("./budgetAlerts");
    const supabase = makeSupabase({
      budgets: [{ user_id: "user-1", category: "Makanan", monthly_limit: 1000 }],
      transactions: [
        { user_id: "user-1", type: "expense", category: "Makanan", amount: 950, occurred_on: thisMonthDay },
      ],
      budget_alert_log: [],
    });

    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");
    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");

    expect(sendPushToUser).toHaveBeenCalledTimes(1);
  });

  it("skips entirely when the user turned off budget-alert push in their preferences", async () => {
    const sendPushToUser = vi.fn();
    vi.doMock("@/lib/push", () => ({ sendPushToUser }));
    const { checkBudgetAlertAndNotify } = await import("./budgetAlerts");
    const supabase = makeSupabase({
      notification_preferences: [{ user_id: "user-1", push_budget_alerts: false }],
      budgets: [{ user_id: "user-1", category: "Makanan", monthly_limit: 1000 }],
      transactions: [
        { user_id: "user-1", type: "expense", category: "Makanan", amount: 1200, occurred_on: thisMonthDay },
      ],
      budget_alert_log: [],
    });

    await checkBudgetAlertAndNotify(supabase as never, "user-1", "Makanan");
    expect(sendPushToUser).not.toHaveBeenCalled();
  });
});

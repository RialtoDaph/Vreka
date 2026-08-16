import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TODAY_DAY = new Date().getDate();
const PERIOD = new Date().toISOString().slice(0, 7);

function req(secret?: string) {
  return new NextRequest("http://localhost/api/cron/recurring-post", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

type AdminMockConfig = {
  dueItems?: Array<Record<string, unknown>>;
  // Item IDs that should fail the atomic check-claim insert with a
  // unique-violation, simulating "already posted this period".
  alreadyClaimedItemIds?: string[];
  txInsertResult?: { data: { id: string } | null; error: { message: string } | null };
  // None set, by default -- matches the normal "user hasn't picked a
  // primary rekening yet" case.
  primaryAccountId?: string | null;
};

function mockAdmin({
  dueItems = [],
  alreadyClaimedItemIds = [],
  txInsertResult,
  primaryAccountId = null,
}: AdminMockConfig) {
  const insertedTransactions: unknown[] = [];
  const insertedChecks: Array<{ user_id: string; recurring_item_id: string; transaction_id: string | null; period: string }> = [];
  const deletedCheckIds: string[] = [];
  const updatedChecks: Array<{ id: string; transaction_id: string }> = [];

  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
      from: (table: string) => {
        if (table === "recurring_items") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ data: dueItems, error: null }),
              }),
            }),
          };
        }
        if (table === "recurring_item_checks") {
          return {
            insert: (payload: { recurring_item_id: string }) => ({
              select: () => ({
                single: () => {
                  if (alreadyClaimedItemIds.includes(payload.recurring_item_id)) {
                    return Promise.resolve({
                      data: null,
                      error: { message: "duplicate key value violates unique constraint", code: "23505" },
                    });
                  }
                  const id = `check-${payload.recurring_item_id}`;
                  insertedChecks.push({
                    user_id: payload.recurring_item_id === "item-1" ? "user-1" : "unknown",
                    recurring_item_id: payload.recurring_item_id,
                    transaction_id: null,
                    period: PERIOD,
                  } as never);
                  return Promise.resolve({ data: { id }, error: null });
                },
              }),
            }),
            update: (payload: { transaction_id: string }) => ({
              eq: (_col: string, id: string) => {
                updatedChecks.push({ id, transaction_id: payload.transaction_id });
                return Promise.resolve({ error: null });
              },
            }),
            delete: () => ({
              eq: (_col: string, id: string) => {
                deletedCheckIds.push(id);
                return Promise.resolve({ error: null });
              },
            }),
          };
        }
        if (table === "transactions") {
          return {
            insert: (payload: unknown) => {
              insertedTransactions.push(payload);
              return {
                select: () => ({
                  single: () => Promise.resolve(txInsertResult ?? { data: { id: "tx-1" }, error: null }),
                }),
              };
            },
          };
        }
        if (table === "accounts") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: primaryAccountId ? { id: primaryAccountId } : null,
                      error: null,
                    }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));

  return { insertedTransactions, insertedChecks, deletedCheckIds, updatedChecks };
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /api/cron/recurring-post", () => {
  it("rejects requests without the correct CRON_SECRET", async () => {
    mockAdmin({});
    const { GET } = await import("./route");
    const res = await GET(req("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("rejects requests when CRON_SECRET is unset, even with header 'Bearer undefined'", async () => {
    // Regression: `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` used
    // to make an unset secret literally match the string "Bearer undefined".
    vi.stubEnv("CRON_SECRET", "");
    mockAdmin({});
    const { GET } = await import("./route");
    const res = await GET(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("claims the period, posts the transaction, then links it back to the check", async () => {
    const { insertedTransactions, updatedChecks } = mockAdmin({
      dueItems: [
        {
          id: "item-1",
          user_id: "user-1",
          type: "expense",
          category: "Tagihan",
          name: "Internet",
          amount: 45,
          day_of_month: TODAY_DAY,
          auto_post: true,
        },
      ],
    });
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([{ item_id: "item-1", name: "Internet", status: "posted" }]);
    expect(insertedTransactions).toEqual([
      {
        user_id: "user-1",
        type: "expense",
        category: "Tagihan",
        amount: 45,
        description: "Internet",
        occurred_on: new Date().toISOString().slice(0, 10),
        account_id: null,
      },
    ]);
    expect(updatedChecks).toEqual([{ id: "check-item-1", transaction_id: "tx-1" }]);
  });

  it("posts the auto-posted transaction against the user's primary rekening when they have one", async () => {
    const { insertedTransactions } = mockAdmin({
      dueItems: [
        {
          id: "item-1",
          user_id: "user-1",
          type: "expense",
          category: "Tagihan",
          name: "Internet",
          amount: 45,
          day_of_month: TODAY_DAY,
          auto_post: true,
        },
      ],
      primaryAccountId: "acct-1",
    });
    const { GET } = await import("./route");
    await GET(req("test-secret"));

    expect(insertedTransactions).toEqual([
      expect.objectContaining({ account_id: "acct-1" }),
    ]);
  });

  it("skips a due item whose period-claim loses to a unique-violation, without inserting a duplicate transaction", async () => {
    const { insertedTransactions } = mockAdmin({
      dueItems: [
        {
          id: "item-1",
          user_id: "user-1",
          type: "expense",
          category: "Tagihan",
          name: "Internet",
          amount: 45,
          day_of_month: TODAY_DAY,
          auto_post: true,
        },
      ],
      alreadyClaimedItemIds: ["item-1"],
    });
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([
      { item_id: "item-1", name: "Internet", status: "skip: already posted this period" },
    ]);
    expect(insertedTransactions).toEqual([]);
  });

  it("releases the claim when the transaction insert fails, so a later run can retry", async () => {
    const { deletedCheckIds } = mockAdmin({
      dueItems: [
        {
          id: "item-1",
          user_id: "user-1",
          type: "expense",
          category: "Tagihan",
          name: "Internet",
          amount: 45,
          day_of_month: TODAY_DAY,
          auto_post: true,
        },
      ],
      txInsertResult: { data: null, error: { message: "insert failed" } },
    });
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([
      { item_id: "item-1", name: "Internet", status: "error: insert failed" },
    ]);
    expect(deletedCheckIds).toEqual(["check-item-1"]);
  });

  it("returns an empty result set when nothing is due today", async () => {
    mockAdmin({ dueItems: [] });
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body).toEqual({ results: [] });
  });

  it("returns 429 once the rate limit is hit", async () => {
    mockAdmin({ dueItems: [] });
    const { GET } = await import("./route");
    for (let i = 0; i < 5; i++) {
      const res = await GET(req("test-secret"));
      expect(res.status).toBe(200);
    }
    const res = await GET(req("test-secret"));
    expect(res.status).toBe(429);
  });
});

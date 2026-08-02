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
  existingChecks?: Array<{ recurring_item_id: string }>;
  txInsertResult?: { data: { id: string } | null; error: { message: string } | null };
};

function mockAdmin({ dueItems = [], existingChecks = [], txInsertResult }: AdminMockConfig) {
  const insertedTransactions: unknown[] = [];
  const insertedChecks: unknown[] = [];

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
            select: () => ({
              eq: () => ({
                in: () => Promise.resolve({ data: existingChecks, error: null }),
              }),
            }),
            insert: (payload: unknown) => {
              insertedChecks.push(payload);
              return Promise.resolve({ error: null });
            },
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
        throw new Error(`unexpected table: ${table}`);
      },
    }),
  }));

  return { insertedTransactions, insertedChecks };
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

  it("posts a transaction for a due item that hasn't been checked this period", async () => {
    const { insertedTransactions, insertedChecks } = mockAdmin({
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
      existingChecks: [],
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
      },
    ]);
    expect(insertedChecks).toEqual([
      { user_id: "user-1", recurring_item_id: "item-1", transaction_id: "tx-1", period: PERIOD },
    ]);
  });

  it("skips a due item that's already been posted this period, without inserting a duplicate", async () => {
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
      existingChecks: [{ recurring_item_id: "item-1" }],
    });
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([
      { item_id: "item-1", name: "Internet", status: "skip: already posted this period" },
    ]);
    expect(insertedTransactions).toEqual([]);
  });

  it("returns an empty result set without querying checks when nothing is due today", async () => {
    mockAdmin({ dueItems: [] });
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body).toEqual({ results: [] });
  });
});

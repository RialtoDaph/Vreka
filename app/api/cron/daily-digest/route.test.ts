import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(secret?: string) {
  return new NextRequest("http://localhost/api/cron/daily-digest", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

// A thenable + fluent query-builder stub: every chain method returns itself,
// and `await`-ing it resolves to the configured result — matches however
// many .eq()/.gte()/.not() calls the real code chains on.
function chainable(result: { data: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    eq: () => obj,
    neq: () => obj,
    not: () => obj,
    gte: () => obj,
    lt: () => obj,
    lte: () => obj,
    limit: () => obj,
    order: () => obj,
    maybeSingle: () => Promise.resolve(result),
    // cron_dedupe's claimOnce() and the Gmail section's assistant_messages
    // write both just `await ...insert(...)` directly (no further
    // chaining), so insert() itself needs to resolve like a query result.
    insert: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

// Defaults `cron_dedupe` claims to "not yet claimed today" (error: null)
// unless a test overrides it, so existing send-path assertions don't all
// need to know about the dedupe table.
function mockAdmin(tables: Record<string, Array<{ data: unknown; error?: unknown }>>) {
  const counters: Record<string, number> = {};
  const withDefaults: Record<string, Array<{ data: unknown; error?: unknown }>> = {
    cron_dedupe: [{ data: null, error: null }],
    ...tables,
  };
  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
      from: (table: string) => {
        const results = withDefaults[table] ?? [{ data: [], error: null }];
        const idx = counters[table] ?? 0;
        counters[table] = idx + 1;
        return chainable(results[Math.min(idx, results.length - 1)]);
      },
    }),
  }));
}

function mockTelegram() {
  const sent: Array<{ chatId: number; text: string }> = [];
  vi.doMock("@/lib/telegram/bot", () => ({
    sendTelegramMessage: vi.fn((chatId: number, text: string) => {
      sent.push({ chatId, text });
      return Promise.resolve();
    }),
  }));
  return sent;
}

function mockGoogle() {
  vi.doMock("@/lib/google/gmail", () => ({
    refreshAccessToken: vi.fn().mockResolvedValue("fake-access-token"),
    listMessages: vi.fn().mockResolvedValue([]),
    getMessage: vi.fn(),
  }));
  vi.doMock("@/lib/google/calendar", () => ({
    listUpcomingEvents: vi.fn().mockResolvedValue([]),
  }));
}

function mockPush(sendResult: { sent: number; removed: number } = { sent: 1, removed: 0 }) {
  const calls: Array<{ userId: string; payload: unknown }> = [];
  vi.doMock("@/lib/push", () => ({
    sendPushToUser: vi.fn((_admin: unknown, userId: string, payload: unknown) => {
      calls.push({ userId, payload });
      return Promise.resolve(sendResult);
    }),
  }));
  return calls;
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /api/cron/daily-digest", () => {
  it("rejects requests without the correct CRON_SECRET", async () => {
    mockAdmin({});
    mockGoogle();
    const { GET } = await import("./route");
    const res = await GET(req("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("rejects requests when CRON_SECRET is unset, even with header 'Bearer undefined'", async () => {
    // Regression: `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` used
    // to make an unset secret literally match the string "Bearer undefined".
    vi.stubEnv("CRON_SECRET", "");
    mockAdmin({});
    mockGoogle();
    const { GET } = await import("./route");
    const res = await GET(req("undefined"));
    expect(res.status).toBe(401);
  });

  it("returns 429 once the rate limit is hit", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    mockAdmin({});
    mockGoogle();
    mockTelegram();
    const { GET } = await import("./route");
    for (let i = 0; i < 5; i++) {
      const res = await GET(req("test-secret"));
      expect(res.status).toBe(200);
    }
    const res = await GET(req("test-secret"));
    expect(res.status).toBe(429);
  });

  it("does nothing when neither ANTHROPIC_API_KEY nor TELEGRAM_BOT_TOKEN is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    mockAdmin({});
    mockGoogle();
    const sent = mockTelegram();
    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("sends a morning briefing covering saldo, due/overdue tasks, budget alerts, and pending habits", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    mockGoogle();
    const sent = mockTelegram();

    const today = new Date().toISOString().slice(0, 10);
    mockAdmin({
      telegram_links: [{ data: [{ user_id: "user-1", chat_id: 555 }] }],
      transactions: [
        {
          data: [
            { type: "income", category: "Gaji", amount: 2000 },
            { type: "expense", category: "Makanan", amount: 300 },
          ],
        },
      ],
      budgets: [{ data: [{ category: "Makanan", monthly_limit: 300 }] }],
      // First call = due-today tasks, second call = overdue tasks.
      tasks: [
        { data: [{ title: "Kirim laporan", priority: "high" }] },
        { data: [{ title: "Bayar tagihan" }] },
      ],
      habits: [{ data: [{ id: "h1", title: "Olahraga" }] }],
      habit_checks: [{ data: [] }],
      google_credentials: [{ data: null }],
    });

    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([{ user_id: "user-1", status: "morning briefing sent" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].chatId).toBe(555);
    const text = sent[0].text;
    expect(text).toContain("Kirim laporan");
    expect(text).toContain("Bayar tagihan");
    expect(text).toContain("Makanan: 100%"); // budget fully used -> alert
    expect(text).toContain("Olahraga");
    expect(today.length).toBe(10); // sanity, keeps `today` referenced
  });

  it("records a per-user error instead of failing the whole cron run when sending fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    mockGoogle();
    vi.doMock("@/lib/telegram/bot", () => ({
      sendTelegramMessage: vi.fn().mockRejectedValue(new Error("Telegram down")),
    }));

    mockAdmin({
      telegram_links: [{ data: [{ user_id: "user-1", chat_id: 555 }] }],
      transactions: [{ data: [] }],
      budgets: [{ data: [] }],
      tasks: [{ data: [] }, { data: [] }],
      habits: [{ data: [] }],
      habit_checks: [{ data: [] }],
      google_credentials: [{ data: null }],
    });

    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([
      { user_id: "user-1", status: "briefing error: Telegram down" },
    ]);
  });

  it("sends a push notification with a compact summary to each user with an active subscription", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    mockGoogle();
    const pushCalls = mockPush({ sent: 1, removed: 0 });

    mockAdmin({
      push_subscriptions: [{ data: [{ user_id: "user-1" }] }],
      transactions: [{ data: [{ type: "income", category: "Gaji", amount: 1000 }] }],
      budgets: [{ data: [] }],
      tasks: [{ data: [{ title: "Due", priority: "high" }] }, { data: [] }],
      habits: [{ data: [] }],
      habit_checks: [{ data: [] }],
      google_credentials: [{ data: null }],
    });

    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([{ user_id: "user-1", status: "push sent to 1 device(s)" }]);
    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0].userId).toBe("user-1");
    expect(pushCalls[0].payload).toMatchObject({
      title: "🌅 Ringkasan Pagi",
      body: expect.stringContaining("1 tugas due"),
      url: "/dashboard",
    });
  });

  it("skips a channel that already claimed today's dedupe key, without sending again", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-bot-token");
    mockGoogle();
    const sent = mockTelegram();

    mockAdmin({
      cron_dedupe: [{ data: null, error: { message: "duplicate key", code: "23505" } }],
      telegram_links: [{ data: [{ user_id: "user-1", chat_id: 555 }] }],
    });

    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([
      { user_id: "user-1", status: "skip: briefing already sent today" },
    ]);
    expect(sent).toEqual([]);
  });

  it("keeps the push section running even when the Gmail section's own query fails", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
    vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
    mockGoogle();
    const pushCalls = mockPush({ sent: 1, removed: 0 });

    mockAdmin({
      google_credentials: [{ data: null, error: { message: "db unreachable" } }],
      push_subscriptions: [{ data: [{ user_id: "user-1" }] }],
      transactions: [{ data: [] }],
      budgets: [{ data: [] }],
      tasks: [{ data: [] }, { data: [] }],
      habits: [{ data: [] }],
      habit_checks: [{ data: [] }],
    });

    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toContainEqual({ user_id: "user-1", status: "push sent to 1 device(s)" });
    expect(body.results).toContainEqual(
      expect.objectContaining({ user_id: "-", status: expect.stringContaining("gmail section error") })
    );
    expect(pushCalls).toHaveLength(1);
  });

  it("skips the push section entirely when VAPID keys aren't configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    mockGoogle();
    const pushCalls = mockPush();

    mockAdmin({ push_subscriptions: [{ data: [{ user_id: "user-1" }] }] });

    const { GET } = await import("./route");
    const res = await GET(req("test-secret"));
    const body = await res.json();

    expect(body.results).toEqual([]);
    expect(pushCalls).toHaveLength(0);
  });
});

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
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mockAdmin(tables: Record<string, Array<{ data: unknown; error?: unknown }>>) {
  const counters: Record<string, number> = {};
  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({
      from: (table: string) => {
        const results = tables[table] ?? [{ data: [], error: null }];
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
});

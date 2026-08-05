import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A thenable + fluent query-builder stub: every chain method returns itself,
// and `await`-ing it resolves to the configured result — matches however
// many .eq()/.order()/.limit() calls the real code chains on.
function chainable(result: { data: unknown; error?: unknown } = { data: [], error: null }) {
  const obj: Record<string, unknown> = {
    select: () => obj,
    insert: () => obj,
    eq: () => obj,
    neq: () => obj,
    not: () => obj,
    gte: () => obj,
    order: () => obj,
    limit: () => obj,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mockSupabaseServer(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: () => chainable(),
    }),
  }));
}

// `after()` needs a live Next.js request context that vitest doesn't set up,
// so it's stubbed to just run the callback inline — same behavior (the
// callback fires) without the "called outside a request scope" throw.
function mockAfter() {
  vi.doMock("next/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next/server")>();
    return { ...actual, after: (cb: () => unknown) => cb() };
  });
}

function mockTools() {
  vi.doMock("@/lib/assistant/tools", () => ({
    ASSISTANT_TOOLS: [],
    executeAssistantTool: vi.fn().mockResolvedValue({ ok: true, result: "done" }),
  }));
}

type FakeTurn = {
  deltas: string[];
  response: { stop_reason: string; content: unknown[] };
};

function fakeStream(turn: FakeTurn) {
  const listeners: Record<string, (delta: string) => void> = {};
  return {
    on(event: string, cb: (delta: string) => void) {
      listeners[event] = cb;
      return this;
    },
    async finalMessage() {
      for (const delta of turn.deltas) listeners.text?.(delta);
      return turn.response;
    },
  };
}

function mockAnthropic(turns: FakeTurn[]) {
  let call = 0;
  const streamSpy = vi.fn<(params: { model: string; messages: unknown[] }) => ReturnType<typeof fakeStream>>(() => {
    const turn = turns[Math.min(call, turns.length - 1)];
    call += 1;
    return fakeStream(turn);
  });
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class {
      messages = { stream: streamSpy };
    },
  }));
  return streamSpy;
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/chat", () => {
  it("rejects unauthenticated requests", async () => {
    mockSupabaseServer(null);
    mockAfter();
    mockTools();
    mockAnthropic([{ deltas: [], response: { stop_reason: "end_turn", content: [] } }]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "halo" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it("rejects an empty message", async () => {
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    mockAnthropic([{ deltas: [], response: { stop_reason: "end_turn", content: [] } }]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "   " }));

    expect(res.status).toBe(400);
  });

  it("streams Aslan's reply back as plain text as it arrives", async () => {
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    mockAnthropic([
      {
        deltas: ["Halo! ", "Saldo kamu bulan ini positif."],
        response: {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Halo! Saldo kamu bulan ini positif." }],
        },
      },
    ]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "gimana saldo aku?" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("Halo! Saldo kamu bulan ini positif.");
  });

  it("streams text across a tool-use turn and the follow-up turn", async () => {
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    const streamSpy = mockAnthropic([
      {
        deltas: ["Bentar, aku catet dulu ya... "],
        response: {
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "Bentar, aku catet dulu ya... " },
            { type: "tool_use", id: "t1", name: "add_transaction", input: {} },
          ],
        },
      },
      {
        deltas: ["Udah dicatet!"],
        response: {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Udah dicatet!" }],
        },
      },
    ]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "catet pengeluaran 50rb makan siang" }));

    const text = await res.text();
    expect(text).toBe("Bentar, aku catet dulu ya... Udah dicatet!");
    expect(streamSpy).toHaveBeenCalledTimes(2);
  });

  it("uses whichever model is requested in the body", async () => {
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    const streamSpy = mockAnthropic([
      { deltas: ["ok"], response: { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] } },
    ]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "halo", model: "claude-haiku-4-5" }));
    await res.text();

    expect(streamSpy.mock.calls[0][0].model).toBe("claude-haiku-4-5");
  });

  it("falls back to the default model when none (or an invalid one) is given", async () => {
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    const streamSpy = mockAnthropic([
      { deltas: ["ok"], response: { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] } },
    ]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "halo", model: "not-a-real-model" }));
    await res.text();

    expect(streamSpy.mock.calls[0][0].model).toBe("claude-sonnet-5");
  });

  it("attaches a screen-share image as vision content on the last user message", async () => {
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    const streamSpy = mockAnthropic([
      { deltas: ["Aku liat layarnya."], response: { stop_reason: "end_turn", content: [{ type: "text", text: "Aku liat layarnya." }] } },
    ]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "ini apa?", image: "data:image/jpeg;base64,AAAA" }));
    await res.text();

    const lastMessage = streamSpy.mock.calls[0][0].messages.at(-1) as { content: Array<{ type: string }> };
    expect(lastMessage.content.some((block) => block.type === "image")).toBe(true);
  });

  it("returns 429 once the per-user rate limit is hit", async () => {
    mockSupabaseServer({ id: "user-rl" });
    mockAfter();
    mockTools();
    mockAnthropic([{ deltas: ["ok"], response: { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] } }]);

    const { POST } = await import("./route");
    for (let i = 0; i < 30; i++) {
      const res = await POST(makeRequest({ message: `pesan ke-${i}` }));
      expect(res.status).toBe(200);
    }
    const res = await POST(makeRequest({ message: "pesan ke-31" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns 500 with a JSON error when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockSupabaseServer({ id: "user-1" });
    mockAfter();
    mockTools();
    mockAnthropic([{ deltas: [], response: { stop_reason: "end_turn", content: [] } }]);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ message: "halo" }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

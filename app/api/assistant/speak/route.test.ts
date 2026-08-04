import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

function mockOpenAiSpeak(response: { ok: boolean; status?: number; body?: unknown; text?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      body: response.body ?? null,
      text: async () => response.text ?? "",
    })
  );
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/assistant/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/speak", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "halo" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty text", async () => {
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("streams back audio/mpeg from OpenAI's speech endpoint", async () => {
    mockAuth({ id: "user-1" });
    const fakeBody = new ReadableStream();
    mockOpenAiSpeak({ ok: true, body: fakeBody });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "**Halo!**" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("returns 500 when the upstream speech request fails", async () => {
    mockAuth({ id: "user-1" });
    mockOpenAiSpeak({ ok: false, status: 502, text: "upstream error" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "halo" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "halo" }));
    expect(res.status).toBe(500);
  });
});

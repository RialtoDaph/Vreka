import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

function mockContext() {
  vi.doMock("@/lib/assistant/context", () => ({
    buildAssistantSystemPrompt: vi.fn().mockResolvedValue("ringkasan data user"),
  }));
}

function mockOpenAiSession(response: { ok: boolean; status?: number; json?: unknown; text?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json,
      text: async () => response.text ?? "",
    })
  );
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/realtime-session", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    mockContext();
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    mockAuth({ id: "user-1" });
    mockContext();
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(500);
  });

  it("returns the ephemeral client secret and model on success", async () => {
    mockAuth({ id: "user-1" });
    mockContext();
    mockOpenAiSession({ ok: true, json: { value: "ek_abc123", expires_at: 1234567890 } });

    const { POST } = await import("./route");
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.clientSecret).toBe("ek_abc123");
    expect(body.model).toBe("gpt-realtime-2.1-mini");
  });

  it("bakes Santai's persona and the user's data summary into the session instructions", async () => {
    mockAuth({ id: "user-1" });
    mockContext();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ value: "ek_abc123" }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    await POST();

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.session.instructions).toContain("Mode SANTAI lagi aktif");
    expect(body.session.instructions).toContain("ringkasan data user");
    expect(body.session.type).toBe("realtime");
  });

  it("returns 500 when the upstream session request fails", async () => {
    mockAuth({ id: "user-1" });
    mockContext();
    mockOpenAiSession({ ok: false, status: 401, text: "invalid api key" });

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(500);
  });

  it("returns 500 when the response is missing the client secret value", async () => {
    mockAuth({ id: "user-1" });
    mockContext();
    mockOpenAiSession({ ok: true, json: { unexpected: "shape" } });

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(500);
  });
});

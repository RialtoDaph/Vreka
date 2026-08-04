import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function mockSupabaseServer(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /api/assistant/providers", () => {
  it("rejects unauthenticated requests", async () => {
    mockSupabaseServer(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports which providers have a server-side key configured, without leaking the key", async () => {
    mockSupabaseServer({ id: "user-1" });
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("XAI_API_KEY", "");

    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(body.configured).toEqual({
      anthropic: true,
      openai: false,
      gemini: true,
      grok: false,
    });
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect(JSON.stringify(body)).not.toContain("test-gemini-key");
  });
});

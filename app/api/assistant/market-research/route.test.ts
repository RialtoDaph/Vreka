import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

function req(body: unknown) {
  return new NextRequest("http://localhost/api/assistant/market-research", {
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

describe("POST /api/assistant/market-research", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/assistant/marketResearch", () => ({ getMarketResearch: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("defaults to the default model when none is given", async () => {
    mockAuth({ id: "user-1" });
    const getMarketResearch = vi.fn().mockResolvedValue({ text: "ok", sources: [] });
    vi.doMock("@/lib/assistant/marketResearch", () => ({ getMarketResearch }));
    const { POST } = await import("./route");
    await POST(req({}));

    expect(getMarketResearch).toHaveBeenCalledWith("test-key", "claude-sonnet-5");
  });

  it("returns the research on success", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/assistant/marketResearch", () => ({
      getMarketResearch: vi.fn().mockResolvedValue({
        text: "Emas naik tipis, USD/EUR stabil.",
        sources: [{ label: "kitco.com", url: "https://www.kitco.com/gold-price" }],
      }),
    }));
    const { POST } = await import("./route");
    const res = await POST(req({}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.text).toBe("Emas naik tipis, USD/EUR stabil.");
    expect(body.sources).toHaveLength(1);
  });

  it("returns a 500 with a friendly message when getMarketResearch throws", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/assistant/marketResearch", () => ({
      getMarketResearch: vi.fn().mockRejectedValue(new Error("api down")),
    }));
    const { POST } = await import("./route");
    const res = await POST(req({}));
    expect(res.status).toBe(500);
  });
});

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
  return new NextRequest("http://localhost/api/assistant/node-insight", {
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

describe("POST /api/assistant/node-insight", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/assistant/nodeInsight", () => ({ getNodeInsight: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ label: "Dana Darurat" }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no label", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/assistant/nodeInsight", () => ({ getNodeInsight: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ typeLabel: "Keuangan" }));
    expect(res.status).toBe(400);
  });

  it("filters malformed field entries before calling getNodeInsight", async () => {
    mockAuth({ id: "user-1" });
    const getNodeInsight = vi.fn().mockResolvedValue({ text: "ok", sources: [] });
    vi.doMock("@/lib/assistant/nodeInsight", () => ({ getNodeInsight }));
    const { POST } = await import("./route");
    await POST(
      req({
        typeLabel: "Keuangan",
        label: "Dana Darurat",
        fields: [{ k: "Progress", v: "45%" }, { bad: "shape" }, "not an object"],
      })
    );

    expect(getNodeInsight).toHaveBeenCalledWith("test-key", "claude-sonnet-5", {
      typeLabel: "Keuangan",
      label: "Dana Darurat",
      fields: [{ k: "Progress", v: "45%" }],
    });
  });

  it("returns the insight on success", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/assistant/nodeInsight", () => ({
      getNodeInsight: vi.fn().mockResolvedValue({
        text: "Insight-nya gini.",
        sources: [{ label: "numbeo.com", url: "https://numbeo.com" }],
      }),
    }));
    const { POST } = await import("./route");
    const res = await POST(req({ label: "Dana Darurat" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.text).toBe("Insight-nya gini.");
    expect(body.sources).toHaveLength(1);
  });

  it("returns a 500 with a friendly message when getNodeInsight throws", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/assistant/nodeInsight", () => ({
      getNodeInsight: vi.fn().mockRejectedValue(new Error("api down")),
    }));
    const { POST } = await import("./route");
    const res = await POST(req({ label: "Dana Darurat" }));
    expect(res.status).toBe(500);
  });
});

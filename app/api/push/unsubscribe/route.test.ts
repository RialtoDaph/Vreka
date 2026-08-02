import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/push/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: () => ({
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      }),
    }),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/push/unsubscribe", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    const { POST } = await import("./route");
    const res = await POST(req({ endpoint: "e" }));
    expect(res.status).toBe(401);
  });

  it("rejects a missing endpoint", async () => {
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("removes the subscription", async () => {
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(req({ endpoint: "e" }));
    expect(res.status).toBe(200);
  });
});

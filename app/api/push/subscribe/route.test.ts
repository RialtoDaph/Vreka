import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null, upsertResult: { error: unknown } = { error: null }) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: () => ({
        upsert: () => Promise.resolve(upsertResult),
      }),
    }),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/push/subscribe", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    const { POST } = await import("./route");
    const res = await POST(req({ endpoint: "e", keys: { p256dh: "p", auth: "a" } }));
    expect(res.status).toBe(401);
  });

  it("rejects an incomplete subscription payload", async () => {
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(req({ endpoint: "e", keys: {} }));
    expect(res.status).toBe(400);
  });

  it("stores a valid subscription", async () => {
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(req({ endpoint: "e", keys: { p256dh: "p", auth: "a" } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

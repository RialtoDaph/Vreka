import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/google/gmail/drafts/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/google/gmail/drafts/delete", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn() }));
    vi.doMock("@/lib/google/gmail", () => ({ deleteDraft: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ id: "d1" }));
    expect(res.status).toBe(401);
  });

  it("deletes the draft for the caller's own token", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn().mockResolvedValue("token-1") }));
    const deleteDraft = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/google/gmail", () => ({ deleteDraft }));
    const { POST } = await import("./route");
    const res = await POST(req({ id: "d1" }));
    expect(res.status).toBe(200);
    expect(deleteDraft).toHaveBeenCalledWith("token-1", "d1");
  });
});

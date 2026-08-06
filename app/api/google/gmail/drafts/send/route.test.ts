import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/google/gmail/drafts/send", {
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

describe("POST /api/google/gmail/drafts/send", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn() }));
    vi.doMock("@/lib/google/gmail", () => ({ sendDraft: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ id: "d1" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty draft id", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn() }));
    vi.doMock("@/lib/google/gmail", () => ({ sendDraft: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ id: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects when Gmail isn't connected", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/google/gmail", () => ({ sendDraft: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ id: "d1" }));
    expect(res.status).toBe(400);
  });

  it("sends the draft for the caller's own token", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn().mockResolvedValue("token-1") }));
    const sendDraft = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/google/gmail", () => ({ sendDraft }));
    const { POST } = await import("./route");
    const res = await POST(req({ id: "d1" }));
    expect(res.status).toBe(200);
    expect(sendDraft).toHaveBeenCalledWith("token-1", "d1");
  });

  it("rate-limits repeated sends", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn().mockResolvedValue("token-1") }));
    vi.doMock("@/lib/google/gmail", () => ({ sendDraft: vi.fn().mockResolvedValue(undefined) }));
    const { POST } = await import("./route");

    let lastStatus = 0;
    for (let i = 0; i < 21; i++) {
      const res = await POST(req({ id: "d1" }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

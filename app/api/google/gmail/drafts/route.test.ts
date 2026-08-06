import { afterEach, describe, expect, it, vi } from "vitest";

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

describe("GET /api/google/gmail/drafts", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn() }));
    vi.doMock("@/lib/google/gmail", () => ({ listDrafts: vi.fn() }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("reports not connected when Gmail isn't linked", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn().mockResolvedValue(null) }));
    vi.doMock("@/lib/google/gmail", () => ({ listDrafts: vi.fn() }));
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ connected: false, drafts: [] });
  });

  it("returns the caller's drafts", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getGmailAccessToken: vi.fn().mockResolvedValue("token-1") }));
    const drafts = [{ id: "d1", to: "a@b.com", subject: "Halo", snippet: "..." }];
    vi.doMock("@/lib/google/gmail", () => ({ listDrafts: vi.fn().mockResolvedValue(drafts) }));
    const { GET } = await import("./route");
    const res = await GET();
    const json = await res.json();
    expect(json).toEqual({ connected: true, drafts });
  });
});

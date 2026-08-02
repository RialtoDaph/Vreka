import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(query = "?q=nasi") {
  return new NextRequest(`http://localhost/api/search${query}`);
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

describe("GET /api/search", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/search", () => ({ searchAll: vi.fn() }));
    const { GET } = await import("./route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns an empty list without calling searchAll when q is blank", async () => {
    mockAuth({ id: "user-1" });
    const searchAll = vi.fn();
    vi.doMock("@/lib/search", () => ({ searchAll }));
    const { GET } = await import("./route");
    const res = await GET(req(""));
    const body = await res.json();

    expect(body).toEqual({ results: [] });
    expect(searchAll).not.toHaveBeenCalled();
  });

  it("delegates to searchAll with the authenticated user's id and query", async () => {
    mockAuth({ id: "user-1" });
    const searchAll = vi.fn().mockResolvedValue([
      { source: "task", id: "t1", title: "Beli oleh-oleh", snippet: "todo", date: "2026-08-01", href: "/dashboard/kerjaan" },
    ]);
    vi.doMock("@/lib/search", () => ({ searchAll }));
    const { GET } = await import("./route");
    const res = await GET(req("?q=oleh-oleh"));
    const body = await res.json();

    expect(searchAll).toHaveBeenCalledWith(expect.anything(), "user-1", "oleh-oleh");
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Beli oleh-oleh");
  });
});

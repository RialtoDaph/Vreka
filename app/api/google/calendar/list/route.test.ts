import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(query = "?from=2026-08-01T00:00:00Z&to=2026-09-01T00:00:00Z") {
  return new NextRequest(`http://localhost/api/google/calendar/list${query}`);
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

describe("GET /api/google/calendar/list", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn(),
    }));
    const { GET } = await import("./route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("requires from/to query params", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn(),
    }));
    const { GET } = await import("./route");
    const res = await GET(req(""));
    expect(res.status).toBe(400);
  });

  it("returns connected:false with no events when Calendar isn't connected, instead of an error", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ error: "not connected" }),
    }));
    const { GET } = await import("./route");
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ connected: false, events: [] });
  });

  it("returns events when Calendar is connected", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ accessToken: "token" }),
    }));
    vi.doMock("@/lib/google/calendar", () => ({
      listUpcomingEvents: vi.fn().mockResolvedValue([
        { id: "e1", summary: "Meeting", start: "2026-08-05T10:00:00Z", end: "2026-08-05T11:00:00Z", location: null },
      ]),
    }));
    const { GET } = await import("./route");
    const res = await GET(req());
    const body = await res.json();

    expect(body.connected).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].summary).toBe("Meeting");
  });
});

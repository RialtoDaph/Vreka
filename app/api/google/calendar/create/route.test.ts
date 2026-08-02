import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/google/calendar/create", {
    method: "POST",
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

describe("POST /api/google/calendar/create", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/google/credentials", () => ({ getCalendarAccessToken: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ summary: "Meeting", start: "2026-08-05T10:00:00+07:00", end: "2026-08-05T11:00:00+07:00" }));
    expect(res.status).toBe(401);
  });

  it("requires summary/start/end", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getCalendarAccessToken: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ summary: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when Calendar isn't connected", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ error: "not connected" }),
    }));
    const { POST } = await import("./route");
    const res = await POST(
      req({ summary: "Meeting", start: "2026-08-05T10:00:00+07:00", end: "2026-08-05T11:00:00+07:00" })
    );
    expect(res.status).toBe(409);
  });

  it("creates the event when Calendar is connected", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ accessToken: "token" }),
    }));
    const createEvent = vi.fn().mockResolvedValue({
      id: "e1",
      summary: "Meeting",
      start: "2026-08-05T10:00:00+07:00",
      end: "2026-08-05T11:00:00+07:00",
      location: null,
    });
    vi.doMock("@/lib/google/calendar", () => ({ createEvent }));
    const { POST } = await import("./route");
    const res = await POST(
      req({ summary: "Meeting", start: "2026-08-05T10:00:00+07:00", end: "2026-08-05T11:00:00+07:00" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.event.summary).toBe("Meeting");
    expect(createEvent).toHaveBeenCalledWith("token", {
      summary: "Meeting",
      startIso: "2026-08-05T10:00:00+07:00",
      endIso: "2026-08-05T11:00:00+07:00",
      description: undefined,
    });
  });
});

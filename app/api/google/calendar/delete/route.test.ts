import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(eventId?: string) {
  const url = eventId
    ? `http://localhost/api/google/calendar/delete?eventId=${encodeURIComponent(eventId)}`
    : "http://localhost/api/google/calendar/delete";
  return new NextRequest(url, { method: "DELETE" });
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

describe("DELETE /api/google/calendar/delete", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/google/credentials", () => ({ getCalendarAccessToken: vi.fn() }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req("e1"));
    expect(res.status).toBe(401);
  });

  it("requires eventId", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({ getCalendarAccessToken: vi.fn() }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req());
    expect(res.status).toBe(400);
  });

  it("returns 409 when Calendar isn't connected", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ error: "not connected" }),
    }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req("e1"));
    expect(res.status).toBe(409);
  });

  it("deletes the event when Calendar is connected", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/google/credentials", () => ({
      getCalendarAccessToken: vi.fn().mockResolvedValue({ accessToken: "token" }),
    }));
    const deleteEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/google/calendar", () => ({ deleteEvent }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req("e1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deleteEvent).toHaveBeenCalledWith("token", "e1");
  });
});

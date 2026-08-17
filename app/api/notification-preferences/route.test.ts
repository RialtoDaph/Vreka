import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function mockAuth(user: { id: string } | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /api/notification-preferences", () => {
  it("rejects unauthenticated requests", async () => {
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => mockAuth(null) }));
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns all-on defaults when the user never customized preferences", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        }),
      }),
    }));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.preferences).toEqual({
      pushDailyDigest: true,
      pushBudgetAlerts: true,
      telegramDailyBriefing: true,
    });
  });

  it("returns the stored row when the user has customized preferences", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { push_daily_digest: false, push_budget_alerts: true, telegram_daily_briefing: false },
                error: null,
              }),
            }),
          }),
        }),
      }),
    }));
    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(body.preferences).toEqual({
      pushDailyDigest: false,
      pushBudgetAlerts: true,
      telegramDailyBriefing: false,
    });
  });
});

describe("PATCH /api/notification-preferences", () => {
  it("rejects unauthenticated requests", async () => {
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => mockAuth(null) }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ pushDailyDigest: false }));
    expect(res.status).toBe(401);
  });

  it("upserts only the changed field, keeping the rest at their current value", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert,
        }),
      }),
    }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ pushDailyDigest: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        push_daily_digest: false,
        push_budget_alerts: true,
        telegram_daily_briefing: true,
      }),
      { onConflict: "user_id" }
    );
  });

  it("returns 500 when the upsert fails", async () => {
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        ...mockAuth({ id: "user-1" }),
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          upsert: vi.fn().mockResolvedValue({ error: { message: "boom" } }),
        }),
      }),
    }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ pushDailyDigest: false }));
    expect(res.status).toBe(500);
  });
});

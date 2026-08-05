import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/keuangan/budget-alert-check", {
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

describe("POST /api/keuangan/budget-alert-check", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    vi.doMock("@/lib/budgetAlerts", () => ({ checkBudgetAlertAndNotify: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ category: "Makanan" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty category", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/budgetAlerts", () => ({ checkBudgetAlertAndNotify: vi.fn() }));
    const { POST } = await import("./route");
    const res = await POST(req({ category: "" }));
    expect(res.status).toBe(400);
  });

  it("runs the budget check for the caller's own category", async () => {
    mockAuth({ id: "user-1" });
    const checkBudgetAlertAndNotify = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/budgetAlerts", () => ({ checkBudgetAlertAndNotify }));
    const { POST } = await import("./route");
    const res = await POST(req({ category: "Makanan" }));

    expect(res.status).toBe(200);
    expect(checkBudgetAlertAndNotify).toHaveBeenCalledWith(expect.anything(), "user-1", "Makanan");
  });

  it("rate-limits repeated calls", async () => {
    mockAuth({ id: "user-1" });
    vi.doMock("@/lib/budgetAlerts", () => ({ checkBudgetAlertAndNotify: vi.fn().mockResolvedValue(undefined) }));
    const { POST } = await import("./route");

    let lastStatus = 0;
    for (let i = 0; i < 61; i++) {
      const res = await POST(req({ category: "Makanan" }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

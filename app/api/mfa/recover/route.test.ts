import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { hashRecoveryCode } from "@/lib/mfaRecovery";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/mfa/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSupabase(opts: {
  user: { id: string } | null;
  codeRows?: { id: string; code_hash: string }[];
  factors?: { id: string; status: string }[];
}) {
  const codeRows = opts.codeRows ?? [];
  const deleted: string[] = [];
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: {
        getUser: async () => ({ data: { user: opts.user } }),
        mfa: { listFactors: async () => ({ data: { totp: opts.factors ?? [] } }) },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: (_col: string, hash: string) => ({
              maybeSingle: async () => ({ data: codeRows.find((r) => r.code_hash === hash) ?? null }),
            }),
          }),
        }),
        delete: () => ({
          eq: (_col: string, id: string) => ({
            eq: async () => {
              deleted.push(id);
              return { error: null };
            },
          }),
        }),
      }),
    }),
  }));
  return { deleted };
}

function mockAdmin(deleteFactor: ReturnType<typeof vi.fn>) {
  vi.doMock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ auth: { admin: { mfa: { deleteFactor } } } }),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/mfa/recover", () => {
  it("rejects unauthenticated requests", async () => {
    mockSupabase({ user: null });
    mockAdmin(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(req({ code: "AB12C-DE34F" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty code", async () => {
    mockSupabase({ user: { id: "user-1" } });
    mockAdmin(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(req({ code: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a code that doesn't match any stored hash", async () => {
    mockSupabase({ user: { id: "user-1" }, codeRows: [] });
    mockAdmin(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(req({ code: "WRONG-CODE1" }));
    expect(res.status).toBe(401);
  });

  it("consumes a valid code and deletes every verified TOTP factor via the admin client", async () => {
    const validHash = await hashRecoveryCode("AB12C-DE34F");
    const { deleted } = mockSupabase({
      user: { id: "user-1" },
      codeRows: [{ id: "code-1", code_hash: validHash }],
      factors: [
        { id: "factor-1", status: "verified" },
        { id: "factor-2", status: "unverified" },
      ],
    });
    const deleteFactor = vi.fn().mockResolvedValue({ error: null });
    mockAdmin(deleteFactor);

    const { POST } = await import("./route");
    const res = await POST(req({ code: "ab12c-de34f" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(deleted).toEqual(["code-1"]);
    // Only the verified factor gets unenrolled -- an unverified one was
    // never actually protecting anything.
    expect(deleteFactor).toHaveBeenCalledTimes(1);
    expect(deleteFactor).toHaveBeenCalledWith({ id: "factor-1", userId: "user-1" });
  });

  it("normalizes formatting before matching (dashes/case-insensitive)", async () => {
    const validHash = await hashRecoveryCode("AB12C-DE34F");
    mockSupabase({
      user: { id: "user-1" },
      codeRows: [{ id: "code-1", code_hash: validHash }],
      factors: [],
    });
    mockAdmin(vi.fn());

    const { POST } = await import("./route");
    const res = await POST(req({ code: "ab12cde34f" }));
    expect(res.status).toBe(200);
  });

  it("rate-limits repeated attempts", async () => {
    mockSupabase({ user: { id: "user-1" }, codeRows: [] });
    mockAdmin(vi.fn());
    const { POST } = await import("./route");

    let lastStatus = 0;
    for (let i = 0; i < 6; i++) {
      const res = await POST(req({ code: "WRONG-CODE1" }));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

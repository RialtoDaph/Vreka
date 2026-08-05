import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function req(query: string) {
  return new NextRequest(`http://localhost/auth/callback${query}`);
}

function mockExchange(error: { message: string } | null = null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { exchangeCodeForSession: async () => ({ error }) },
    }),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GET /auth/callback", () => {
  it("redirects to the default dashboard path when no next param is given", async () => {
    mockExchange();
    const { GET } = await import("./route");
    const res = await GET(req("?code=abc"));
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("follows a safe relative next path", async () => {
    mockExchange();
    const { GET } = await import("./route");
    const res = await GET(req("?code=abc&next=/dashboard/keuangan"));
    expect(res.headers.get("location")).toBe("http://localhost/dashboard/keuangan");
  });

  it("falls back to /dashboard for a protocol-relative next (//evil.com)", async () => {
    mockExchange();
    const { GET } = await import("./route");
    const res = await GET(req("?code=abc&next=" + encodeURIComponent("//evil.com")));
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("falls back to /dashboard for a backslash next (browsers treat it like a slash)", async () => {
    mockExchange();
    const { GET } = await import("./route");
    const res = await GET(req("?code=abc&next=" + encodeURIComponent("/\\evil.com")));
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("falls back to /dashboard for a next containing userinfo (@evil.com)", async () => {
    mockExchange();
    const { GET } = await import("./route");
    const res = await GET(req("?code=abc&next=" + encodeURIComponent("/x@evil.com")));
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("redirects to /login with an error when the code exchange fails", async () => {
    mockExchange({ message: "Kode udah kepake" });
    const { GET } = await import("./route");
    const res = await GET(req("?code=abc"));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=Kode%20udah%20kepake");
  });

  it("redirects to /login when there's no code at all", async () => {
    mockExchange();
    const { GET } = await import("./route");
    const res = await GET(req(""));
    expect(res.headers.get("location")).toContain("/login?error=");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

function mockAnthropicResponse(json: unknown) {
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify(json) }],
        }),
      };
    },
  }));
}

function makeRequest(fields: Record<string, string | File | undefined>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  return new NextRequest("http://localhost/api/assistant/scan-receipt", {
    method: "POST",
    body: form,
  });
}

function fakeImage(type = "image/jpeg", bytes = 10): File {
  return new File([new Uint8Array(bytes)], "receipt.jpg", { type });
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/scan-receipt", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ image: fakeImage() }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no image", async () => {
    mockAuth({ id: "user-1" });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported file type", async () => {
    mockAuth({ id: "user-1" });
    mockAnthropicResponse({});
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ image: fakeImage("application/pdf") }));
    expect(res.status).toBe(400);
  });

  it("extracts amount/category/description/date from a valid receipt", async () => {
    mockAuth({ id: "user-1" });
    mockAnthropicResponse({
      amount: 45.5,
      category: "Makanan",
      description: "Warung Padang",
      occurred_on: "2026-08-01",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ image: fakeImage() }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      amount: 45.5,
      category: "Makanan",
      description: "Warung Padang",
      occurred_on: "2026-08-01",
    });
  });

  it("falls back to Lainnya when the model returns a category outside the known list", async () => {
    mockAuth({ id: "user-1" });
    mockAnthropicResponse({
      amount: 10,
      category: "Not A Real Category",
      description: "",
      occurred_on: "",
    });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ image: fakeImage() }));
    const body = await res.json();

    expect(body.category).toBe("Lainnya");
  });

  it("returns 422 when the image doesn't look like a receipt (amount 0)", async () => {
    mockAuth({ id: "user-1" });
    mockAnthropicResponse({ amount: 0, category: "Lainnya", description: "", occurred_on: "" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ image: fakeImage() }));
    expect(res.status).toBe(422);
  });
});

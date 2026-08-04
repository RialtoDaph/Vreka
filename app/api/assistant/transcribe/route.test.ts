import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

function mockOpenAiTranscribe(response: { ok: boolean; status?: number; json?: unknown; text?: string } | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      response === null
        ? Promise.reject(new Error("should not be called"))
        : {
            ok: response.ok,
            status: response.status ?? (response.ok ? 200 : 500),
            json: async () => response.json,
            text: async () => response.text ?? "",
          }
    )
  );
}

function makeRequest(fields: Record<string, string | Blob | undefined>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, value);
  }
  return new NextRequest("http://localhost/api/assistant/transcribe", {
    method: "POST",
    body: form,
  });
}

function fakeAudio(): Blob {
  return new Blob([new Uint8Array(10)], { type: "audio/webm" });
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/transcribe", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no audio", async () => {
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns the transcript from OpenAI's transcription endpoint", async () => {
    mockAuth({ id: "user-1" });
    mockOpenAiTranscribe({ ok: true, json: { text: "catet pengeluaran 50rb" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    const body = await res.json();
    expect(body.text).toBe("catet pengeluaran 50rb");
  });

  it("treats a known hallucinated silence phrase as no speech", async () => {
    mockAuth({ id: "user-1" });
    mockOpenAiTranscribe({ ok: true, json: { text: "Thank you for watching!" } });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    const body = await res.json();
    expect(body.text).toBe("");
  });

  it("returns empty text for a response shape with no text field", async () => {
    mockAuth({ id: "user-1" });
    mockOpenAiTranscribe({ ok: true, json: {} });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    const body = await res.json();
    expect(body.text).toBe("");
  });

  it("returns 500 when the upstream transcription request fails", async () => {
    mockAuth({ id: "user-1" });
    mockOpenAiTranscribe({ ok: false, status: 502, text: "upstream error" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    mockAuth({ id: "user-1" });
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    expect(res.status).toBe(500);
  });
});

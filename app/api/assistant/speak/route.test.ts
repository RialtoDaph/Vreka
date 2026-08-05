import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

function mockAuth(user: { id: string } | null) {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  }));
}

function mockElevenLabs(convert: ReturnType<typeof vi.fn> | null) {
  vi.doMock("@/lib/assistant/voice", () => ({
    getElevenLabsClient: () =>
      convert ? { textToSpeech: { convert } } : null,
    sanitizeForSpeech: (text: string) => text.replace(/[*_#`]/g, ""),
    DEFAULT_VOICE_ID: "JBFqnCBsd6RMkjVDRZzb",
    TTS_MODEL_ID: "eleven_flash_v2_5",
  }));
}

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/assistant/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/speak", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    mockElevenLabs(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "halo" }));
    expect(res.status).toBe(401);
  });

  it("rejects an empty text", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "   " }));
    expect(res.status).toBe(400);
  });

  it("streams back audio/mpeg from ElevenLabs's speech endpoint", async () => {
    mockAuth({ id: "user-1" });
    const fakeStream = new ReadableStream();
    mockElevenLabs(vi.fn().mockResolvedValue(fakeStream));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "**Halo!**" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
  });

  it("returns 500 and logs when the ElevenLabs SDK call throws", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(vi.fn().mockRejectedValue(new Error("upstream error")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "halo" }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 500 when ELEVENLABS_API_KEY is missing", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ text: "halo" }));
    expect(res.status).toBe(500);
  });
});

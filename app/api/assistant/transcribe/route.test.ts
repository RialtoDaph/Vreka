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
      convert ? { speechToText: { convert } } : null,
    STT_MODEL_ID: "scribe_v1",
  }));
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
  vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("POST /api/assistant/transcribe", () => {
  it("rejects unauthenticated requests", async () => {
    mockAuth(null);
    mockElevenLabs(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    expect(res.status).toBe(401);
  });

  it("rejects a request with no audio", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(vi.fn());
    const { POST } = await import("./route");
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns the transcript when language-detection confidence is high", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(
      vi.fn().mockResolvedValue({ text: "catet pengeluaran 50rb", languageProbability: 0.92 })
    );
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    const body = await res.json();
    expect(body.text).toBe("catet pengeluaran 50rb");
  });

  it("treats a low-confidence transcript as silence instead of relaying it", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(
      vi.fn().mockResolvedValue({ text: "terima kasih", languageProbability: 0.12 })
    );
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    const body = await res.json();
    expect(body.text).toBe("");
  });

  it("returns empty text for a response shape with no text field", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(vi.fn().mockResolvedValue({ transcripts: [] }));
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    const body = await res.json();
    expect(body.text).toBe("");
  });

  it("returns 500 when ELEVENLABS_API_KEY is missing", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(null);
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    expect(res.status).toBe(500);
  });

  it("returns 500 and logs when the ElevenLabs SDK call throws", async () => {
    mockAuth({ id: "user-1" });
    mockElevenLabs(vi.fn().mockRejectedValue(new Error("upstream error")));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ audio: fakeAudio() }));
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });
});

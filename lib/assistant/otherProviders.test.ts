import { afterEach, describe, expect, it, vi } from "vitest";
import { runOpenAiCompatibleChat, runGeminiChat, runOtherProviderChat } from "./otherProviders";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function sseResponse(lines: string[], ok = true, status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`data: ${line}\n\n`));
      controller.close();
    },
  });
  return {
    ok,
    status,
    body,
    text: async () => (ok ? "" : "upstream blew up"),
  } as unknown as Response;
}

describe("runOpenAiCompatibleChat", () => {
  it("assembles streamed deltas into the final reply and forwards each chunk", async () => {
    const chunks = [
      JSON.stringify({ choices: [{ delta: { content: "Hal" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "o!" } }] }),
      "[DONE]",
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(chunks)));

    const deltas: string[] = [];
    const result = await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "gpt-5.6-sol",
      systemPrompt: "kamu Aslan",
      history: [],
      userMessage: "hai",
      baseUrl: "https://api.openai.com/v1",
      onDelta: (d) => deltas.push(d),
    });

    expect(result).toBe("Halo!");
    expect(deltas).toEqual(["Hal", "o!"]);
  });

  it("skips malformed SSE chunks instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse(["not json", JSON.stringify({ choices: [{ delta: { content: "ok" } }] })]))
    );

    const result = await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "gpt-5.6-sol",
      systemPrompt: "",
      history: [],
      userMessage: "hai",
      baseUrl: "https://api.openai.com/v1",
    });

    expect(result).toBe("ok");
  });

  it("throws with the upstream status when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([], false, 401)));

    await expect(
      runOpenAiCompatibleChat({
        apiKey: "bad-key",
        model: "gpt-5.6-sol",
        systemPrompt: "",
        history: [],
        userMessage: "hai",
        baseUrl: "https://api.openai.com/v1",
      })
    ).rejects.toThrow(/401/);
  });

  it("includes prior history in the request body in role order", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(["[DONE]"]));
    vi.stubGlobal("fetch", fetchMock);

    await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "gpt-5.6-sol",
      systemPrompt: "system prompt",
      history: [{ role: "user", content: "sebelumnya" }, { role: "assistant", content: "jawaban lama" }],
      userMessage: "sekarang",
      baseUrl: "https://api.openai.com/v1",
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "sebelumnya" },
      { role: "assistant", content: "jawaban lama" },
      { role: "user", content: "sekarang" },
    ]);
  });
});

describe("runGeminiChat", () => {
  it("assembles streamed deltas from Gemini's candidates shape", async () => {
    const chunks = [
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hai" }] } }] }),
      JSON.stringify({ candidates: [{ content: { parts: [{ text: " juga!" }] } }] }),
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(chunks)));

    const result = await runGeminiChat({
      apiKey: "key",
      model: "gemini-3.6-flash",
      systemPrompt: "kamu Aslan",
      history: [{ role: "assistant", content: "riwayat" }],
      userMessage: "hai",
    });

    expect(result).toBe("Hai juga!");
  });

  it("maps assistant history role to Gemini's 'model' role", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await runGeminiChat({
      apiKey: "key",
      model: "gemini-3.6-flash",
      systemPrompt: "",
      history: [{ role: "assistant", content: "jawaban lama" }],
      userMessage: "sekarang",
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[0]).toEqual({ role: "model", parts: [{ text: "jawaban lama" }] });
  });
});

describe("runOtherProviderChat", () => {
  it("routes grok through the xAI base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(["[DONE]"]));
    vi.stubGlobal("fetch", fetchMock);

    await runOtherProviderChat("grok", {
      apiKey: "key",
      model: "grok-4.5",
      systemPrompt: "",
      history: [],
      userMessage: "hai",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.x.ai/v1/chat/completions");
  });

  it("routes gemini through the Google Generative Language API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await runOtherProviderChat("gemini", {
      apiKey: "key",
      model: "gemini-3.6-flash",
      systemPrompt: "",
      history: [],
      userMessage: "hai",
    });

    expect(fetchMock.mock.calls[0][0]).toContain("generativelanguage.googleapis.com");
  });
});

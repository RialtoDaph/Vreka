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

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => (ok ? "" : "upstream blew up") } as unknown as Response;
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

describe("runOpenAiCompatibleChat with a consult tool", () => {
  it("returns the first response's content directly when no tool call is requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "Gak perlu nyari, aku udah tau." } }] })
    );
    vi.stubGlobal("fetch", fetchMock);
    const consultRun = vi.fn();

    const result = await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "gpt-5.6-sol",
      systemPrompt: "kamu Aslan",
      history: [],
      userMessage: "2+2 berapa?",
      baseUrl: "https://api.openai.com/v1",
      consult: { toolName: "consult_second_opinion", toolDescription: "desc", run: consultRun },
    });

    expect(result).toBe("Gak perlu nyari, aku udah tau.");
    expect(consultRun).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Regression: production logged a 400 from OpenAI --
  // "Function tools with reasoning_effort are not supported for
  // gpt-5.6-sol ... set reasoning_effort to 'none'" -- because the
  // tools-bearing request never set it, and the model defaults to
  // something else. Both Santai (openai) and Fokus (grok) share this code
  // path via their consult tool, so this one bug broke both modes.
  it("sets reasoning_effort to 'none' on the tools-bearing request so reasoning-tier models don't 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "gpt-5.6-sol",
      systemPrompt: "",
      history: [],
      userMessage: "halo",
      baseUrl: "https://api.openai.com/v1",
      consult: { toolName: "consult_second_opinion", toolDescription: "desc", run: vi.fn() },
    });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.reasoning_effort).toBe("none");
    expect(body.tools).toBeDefined();
  });

  it("calls the consult tool and makes a follow-up request when the model requests it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                role: "assistant",
                tool_calls: [
                  { id: "call_1", function: { name: "consult_second_opinion", arguments: '{"query":"harga BTC hari ini"}' } },
                ],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ choices: [{ message: { content: "Berdasarkan hasil cari, BTC lagi di angka segini." } }] })
      );
    vi.stubGlobal("fetch", fetchMock);
    const consultRun = vi.fn().mockResolvedValue("BTC: $123,456");

    const result = await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "grok-4.5",
      systemPrompt: "kamu Aslan mode Fokus",
      history: [],
      userMessage: "harga bitcoin sekarang berapa?",
      baseUrl: "https://api.x.ai/v1",
      consult: { toolName: "consult_second_opinion", toolDescription: "desc", run: consultRun },
    });

    expect(consultRun).toHaveBeenCalledWith("harga BTC hari ini");
    expect(result).toBe("Berdasarkan hasil cari, BTC lagi di angka segini.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_1", content: "BTC: $123,456" });
  });

  it("reports a failed consult call instead of throwing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                tool_calls: [{ id: "call_1", function: { name: "consult_second_opinion", arguments: '{"query":"apa aja"}' } }],
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "Tetep bisa jawab." } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const consultRun = vi.fn().mockRejectedValue(new Error("secondary provider down"));

    const result = await runOpenAiCompatibleChat({
      apiKey: "key",
      model: "grok-4.5",
      systemPrompt: "",
      history: [],
      userMessage: "cari sesuatu",
      baseUrl: "https://api.x.ai/v1",
      consult: { toolName: "consult_second_opinion", toolDescription: "desc", run: consultRun },
    });

    expect(result).toBe("Tetep bisa jawab.");
    const secondCallBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
    expect(secondCallBody.messages.at(-1).content).toBe("Gagal konsultasi ke model lain.");
  });
});

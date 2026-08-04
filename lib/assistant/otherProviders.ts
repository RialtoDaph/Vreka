import type { AssistantProvider } from "@/lib/assistant/models";

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

// Lets a non-Anthropic primary (Santai/OpenAI, Fokus/Grok) delegate a single
// query to a secondary provider (e.g. Gemini for grounded search) instead of
// querying both brains every turn. `run` is already bound to the secondary
// provider/model/key by the caller (lib/assistant/run.ts) -- this module
// doesn't need to know who it's actually talking to.
export type ConsultConfig = {
  toolName: string;
  toolDescription: string;
  run: (query: string) => Promise<string>;
};

export type StreamChatArgs = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: ChatHistoryMessage[];
  userMessage: string;
  onDelta?: (delta: string) => void;
  consult?: ConsultConfig;
};

// Shared by every provider below -- reads an SSE response body line by line,
// handing each `data: ...` payload to the caller. A stream can split a
// single SSE line across two chunks, so partial lines are buffered instead
// of parsed immediately.
async function streamSseLines(response: Response, onLine: (data: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data) onLine(data);
    }
  }
}

async function readErrorDetail(res: Response): Promise<string> {
  const detail = await res.text().catch(() => "");
  return detail.slice(0, 300);
}

async function postJson(url: string, apiKey: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Provider chat gagal (${res.status}): ${await readErrorDetail(res)}`);
  }
  return res.json();
}

type OpenAiToolCall = { id: string; function: { name: string; arguments: string } };

// A tool call means committing to a non-streaming round trip first (need to
// see whether one was requested before anything can be shown to the user),
// then a second call for the real answer -- so a consult-enabled turn trades
// token-by-token streaming for tool support. That's an acceptable tradeoff
// here: Santai's actual live-voice experience goes through the separate
// Realtime API path, not this function, so this only affects typed messages
// and Fokus's turn-based voice.
async function runOpenAiCompatibleChatWithConsult(
  args: StreamChatArgs & { baseUrl: string; consult: ConsultConfig }
): Promise<string> {
  const { apiKey, model, systemPrompt, history, userMessage, onDelta, baseUrl, consult } = args;
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  const tools = [
    {
      type: "function",
      function: {
        name: consult.toolName,
        description: consult.toolDescription,
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "Pertanyaan atau topik yang mau dicek/dicari." } },
          required: ["query"],
        },
      },
    },
  ];

  // Newer reasoning-tier models (confirmed on gpt-5.6-sol in production, and
  // possibly other GPT-5.6 tiers / grok-4.5) default to a non-"none"
  // reasoning effort that OpenAI's /v1/chat/completions rejects outright
  // when `tools` are also present ("Function tools with reasoning_effort
  // are not supported ... set reasoning_effort to 'none'").
  // Only the tools-bearing call needs this -- the follow-up call has no
  // tools and isn't affected.
  const first = await postJson(`${baseUrl}/chat/completions`, apiKey, {
    model,
    messages,
    tools,
    tool_choice: "auto",
    reasoning_effort: "none",
  });
  const firstChoice = (first.choices as Array<{ message: Record<string, unknown> }> | undefined)?.[0];
  const firstMessage = firstChoice?.message;
  if (!firstMessage) return "";

  const toolCalls = firstMessage.tool_calls as OpenAiToolCall[] | undefined;
  if (!toolCalls?.length) {
    const content = typeof firstMessage.content === "string" ? firstMessage.content : "";
    onDelta?.(content);
    return content;
  }

  messages.push(firstMessage);
  for (const call of toolCalls) {
    let query = "";
    try {
      const parsed = JSON.parse(call.function.arguments);
      if (typeof parsed?.query === "string") query = parsed.query;
    } catch {
      // malformed tool-call arguments -- treated as an empty query below
    }
    let result = "Query kosong.";
    if (query) {
      try {
        result = await consult.run(query);
      } catch {
        result = "Gagal konsultasi ke model lain.";
      }
    }
    messages.push({ role: "tool", tool_call_id: call.id, content: result });
  }

  const second = await postJson(`${baseUrl}/chat/completions`, apiKey, { model, messages });
  const secondChoice = (second.choices as Array<{ message: Record<string, unknown> }> | undefined)?.[0];
  const finalContent = typeof secondChoice?.message?.content === "string" ? secondChoice.message.content : "";
  onDelta?.(finalContent);
  return finalContent;
}

// OpenAI and xAI (Grok) both speak the same chat-completions wire format --
// xAI's API is explicitly OpenAI-SDK-compatible -- so one function covers
// both, just pointed at a different base URL.
export async function runOpenAiCompatibleChat(
  args: StreamChatArgs & { baseUrl: string }
): Promise<string> {
  if (args.consult) return runOpenAiCompatibleChatWithConsult({ ...args, consult: args.consult });

  const { apiKey, model, systemPrompt, history, userMessage, onDelta, baseUrl } = args;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Provider chat gagal (${res.status}): ${await readErrorDetail(res)}`);
  }

  let finalText = "";
  await streamSseLines(res, (data) => {
    if (data === "[DONE]") return;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        finalText += delta;
        onDelta?.(delta);
      }
    } catch {
      // malformed/partial SSE chunk -- skip it, next chunk carries on
    }
  });
  return finalText;
}

export async function runGeminiChat(args: StreamChatArgs): Promise<string> {
  const { apiKey, model, systemPrompt, history, userMessage, onDelta } = args;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...history.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        { role: "user", parts: [{ text: userMessage }] },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini chat gagal (${res.status}): ${await readErrorDetail(res)}`);
  }

  let finalText = "";
  await streamSseLines(res, (data) => {
    try {
      const parsed = JSON.parse(data);
      const delta = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof delta === "string" && delta) {
        finalText += delta;
        onDelta?.(delta);
      }
    } catch {
      // malformed/partial SSE chunk -- skip it, next chunk carries on
    }
  });
  return finalText;
}

export async function runOtherProviderChat(
  provider: Exclude<AssistantProvider, "anthropic">,
  args: StreamChatArgs
): Promise<string> {
  if (provider === "openai") return runOpenAiCompatibleChat({ ...args, baseUrl: "https://api.openai.com/v1" });
  if (provider === "grok") return runOpenAiCompatibleChat({ ...args, baseUrl: "https://api.x.ai/v1" });
  return runGeminiChat(args);
}

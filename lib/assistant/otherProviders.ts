import type { AssistantProvider } from "@/lib/assistant/models";

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

export type StreamChatArgs = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: ChatHistoryMessage[];
  userMessage: string;
  onDelta?: (delta: string) => void;
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

// OpenAI and xAI (Grok) both speak the same chat-completions wire format --
// xAI's API is explicitly OpenAI-SDK-compatible -- so one function covers
// both, just pointed at a different base URL.
export async function runOpenAiCompatibleChat(
  args: StreamChatArgs & { baseUrl: string }
): Promise<string> {
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

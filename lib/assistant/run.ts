import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant/tools";

export type RunAssistantChatOptions = {
  onDelta?: (delta: string) => void;
  // A screen-share snapshot (data URL) from the Memory Map's screen-share
  // toggle.
  image?: string;
};

const MAX_TOOL_ITERATIONS = 5;
const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

// `image` comes in as a data URL (e.g. from a <canvas>.toDataURL() screen
// share snapshot) -- split it back into the base64 payload + media type
// Claude's vision API expects.
function parseImageDataUrl(dataUrl: string): Anthropic.Base64ImageSource {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  const mediaType = match?.[1];
  const data = match?.[2];
  if (!data || !IMAGE_MEDIA_TYPES.includes(mediaType as (typeof IMAGE_MEDIA_TYPES)[number])) {
    throw new Error("Format gambar screen share nggak didukung.");
  }
  return { type: "base64", media_type: mediaType as (typeof IMAGE_MEDIA_TYPES)[number], data };
}

// Server-side tool -- Claude executes the search itself and the result
// lands directly in response.content, no client-side execution needed. Kept
// separate from search_records (which only looks at the user's own Vreka
// data): this is for info that genuinely lives outside the app. max_uses
// caps it at a few searches per turn since each one has a real cost and the
// system prompt already tells Aslan not to reach for it reflexively.
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 3,
};

// Tool schemas never change between requests, so caching them (breakpoint on
// the last one covers the whole array) is a reliable, free latency win.
const ALL_TOOLS: Anthropic.ToolUnion[] = [...ASSISTANT_TOOLS, WEB_SEARCH_TOOL];
const CACHED_TOOLS: Anthropic.ToolUnion[] = ALL_TOOLS.map((tool, i) =>
  i === ALL_TOOLS.length - 1 ? { ...tool, cache_control: { type: "ephemeral" } } : tool
);

// Haiku 4.5 doesn't support the effort parameter — sending it returns a 400.
// Opus 5 / Sonnet 5 do. Adaptive thinking is left off on purpose: it made
// Aslan noticeably slower to start replying without a clear quality win for
// the kind of short, tool-driven turns this assistant mostly handles.
export function modelRequestExtras(model: string) {
  if (model === "claude-haiku-4-5") return {};
  return { output_config: { effort: "low" as const } };
}

// Shared by the web chat route and the Telegram webhook — runs one turn of
// the tool-use loop against a user's data and returns Aslan's final reply.
// Persists both the user and assistant messages after returning (via
// next/server's after()), so callers don't wait on the DB write. When
// onDelta is given, text is forwarded to it as it streams in from Anthropic
// (across every tool-loop iteration) so callers can render it live instead
// of waiting for the whole multi-turn loop to finish.
export async function runAssistantChat(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  model: string,
  apiKey: string,
  options: RunAssistantChatOptions = {}
): Promise<string> {
  const { onDelta, image } = options;

  const [{ data: history }, systemPrompt] = await Promise.all([
    supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    buildAssistantSystemPrompt(supabase, userId),
  ]);

  const orderedHistory = ((history ?? []) as Array<{ role: string; content: string }>)
    .slice()
    .reverse();

  const anthropic = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = orderedHistory.map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

  let finalText = "";
  const auditRows: Array<{
    user_id: string;
    tool_name: string;
    input: Record<string, unknown>;
    result_ok: boolean;
    result_summary: string;
  }> = [];

  try {
    const lastUserContent: Anthropic.MessageParam["content"] = image
      ? [{ type: "text", text: userMessage }, { type: "image", source: parseImageDataUrl(image) }]
      : userMessage;
    messages.push({ role: "user", content: lastUserContent });

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages,
        tools: CACHED_TOOLS,
        ...modelRequestExtras(model),
      });
      stream.on("text", (delta) => {
        finalText += delta;
        onDelta?.(delta);
      });
      const response = await stream.finalMessage();

      if (response.stop_reason === "refusal") {
        finalText = "Maaf, aku nggak bisa bantu yang itu.";
        break;
      }

      if (response.stop_reason !== "tool_use") {
        if (!finalText) finalText = "(nggak ada respons)";
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const input = (toolUse.input as Record<string, unknown>) ?? {};
        const { ok, result } = await executeAssistantTool(supabase, userId, toolUse.name, input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
          is_error: !ok,
        });
        auditRows.push({
          user_id: userId,
          tool_name: toolUse.name,
          input,
          result_ok: ok,
          result_summary: result.slice(0, 500),
        });
      }

      messages.push({ role: "user", content: toolResults });

      if (i === MAX_TOOL_ITERATIONS - 1 && !finalText) {
        finalText = "Selesai.";
      }
    }
  } catch (err) {
    // A tool call (e.g. a revoked Google token mid-loop) or the Claude API
    // call itself can throw. `finalText`/`onDelta` may already carry text
    // streamed before the failure (can't un-send what the client already
    // received), so append rather than overwrite -- and critically,
    // `auditRows` from any tool calls that already succeeded earlier in
    // this same loop are kept and still persisted below, instead of
    // vanishing from the Aktivitas log along with the crash.
    console.error("Aslan: tool loop gagal di tengah jalan:", err);
    const fallback = finalText
      ? "\n\n(Ada gangguan pas lanjutin ini -- coba lagi sebentar lagi.)"
      : "Aduh, ada gangguan pas mroses ini. Coba lagi sebentar lagi -- kalau baru connect Gmail/Calendar, coba disconnect & connect ulang dari halaman ini.";
    finalText += fallback;
    onDelta?.(fallback);
  }

  after(async () => {
    try {
      await supabase.from("assistant_messages").insert({
        user_id: userId,
        role: "user",
        content: userMessage,
      });
      await supabase.from("assistant_messages").insert({
        user_id: userId,
        role: "assistant",
        content: finalText,
      });
      if (auditRows.length > 0) {
        await supabase.from("assistant_audit_log").insert(auditRows);
      }
    } catch (err) {
      // Persistence failing here would otherwise silently drop this turn's
      // audit trail even though the underlying tool mutations succeeded.
      console.error("Aslan: gagal simpan riwayat chat / audit log:", err);
    }
  });

  return finalText;
}

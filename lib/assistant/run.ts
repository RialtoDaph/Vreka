import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant/tools";
import { providerForModel, type AssistantProvider } from "@/lib/assistant/models";
import { runOtherProviderChat, type ConsultConfig } from "@/lib/assistant/otherProviders";

// Lets a non-Anthropic primary (Santai/OpenAI, Fokus/Grok) delegate one
// query per turn to a secondary provider (e.g. Gemini) via a consult tool,
// instead of querying both brains every turn. The caller (the chat route)
// already resolved which provider/model/key this points at based on the
// active Aslan mode.
export type SecondaryBrainConfig = {
  provider: Exclude<AssistantProvider, "anthropic">;
  model: string;
  apiKey: string;
};

export type RunAssistantChatOptions = {
  onDelta?: (delta: string) => void;
  // A screen-share snapshot (data URL) -- always goes through Claude
  // regardless of `model`, so the caller is responsible for forcing an
  // Anthropic model when this is set.
  image?: string;
  // Appended ahead of the base system prompt to flavor Aslan's personality
  // for the active mode (santai/fokus/intel/ultra).
  persona?: string;
  secondaryBrain?: SecondaryBrainConfig;
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
//
// `model` picks Aslan's "brain" for this turn. Non-Anthropic models (GPT,
// Gemini, Grok) skip the tool-use loop entirely and just have a plain
// conversation -- replicating this app's tool schemas across four different
// function-calling formats is out of scope for now, so those modes can chat
// but can't nyatet transaksi/tugas/dst (except the single consult tool,
// see `options.secondaryBrain`).
export async function runAssistantChat(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  model: string,
  apiKey: string,
  options: RunAssistantChatOptions = {}
): Promise<string> {
  const { onDelta, image, persona, secondaryBrain } = options;

  const [{ data: history }, basePrompt] = await Promise.all([
    supabase
      .from("assistant_messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    buildAssistantSystemPrompt(supabase, userId),
  ]);
  const systemPrompt = persona ? `${persona}\n\n${basePrompt}` : basePrompt;

  const orderedHistory = ((history ?? []) as Array<{ role: string; content: string }>)
    .slice()
    .reverse();

  let finalText = "";
  const auditRows: Array<{
    user_id: string;
    tool_name: string;
    input: Record<string, unknown>;
    result_ok: boolean;
    result_summary: string;
  }> = [];

  const provider = providerForModel(model);

  if (provider !== "anthropic") {
    try {
      const consult: ConsultConfig | undefined = secondaryBrain
        ? {
            toolName: "consult_second_opinion",
            toolDescription: `Tanya model AI lain (${secondaryBrain.provider}) buat second opinion, cek fakta terkini, atau riset singkat. Jangan dipakai kalau kamu udah yakin sama jawabanmu sendiri.`,
            run: (query: string) =>
              runOtherProviderChat(secondaryBrain.provider, {
                apiKey: secondaryBrain.apiKey,
                model: secondaryBrain.model,
                systemPrompt:
                  "Jawab singkat, faktual, dan langsung ke intinya -- ini bakal dipake sebagai referensi asisten lain, bukan dibaca user langsung.",
                history: [],
                userMessage: query,
              }),
          }
        : undefined;
      finalText = await runOtherProviderChat(provider, {
        apiKey,
        model,
        systemPrompt,
        history: orderedHistory.map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
        userMessage,
        onDelta,
        consult,
      });
      if (!finalText) finalText = "(nggak ada respons)";
    } catch (err) {
      console.error("Aslan: provider chat gagal:", err);
      const fallback = "Aduh, ada gangguan pas mroses ini lewat mode ini. Coba lagi sebentar lagi.";
      finalText += fallback;
      onDelta?.(fallback);
    }

    after(async () => {
      try {
        await supabase.from("assistant_messages").insert({ user_id: userId, role: "user", content: userMessage });
        await supabase.from("assistant_messages").insert({ user_id: userId, role: "assistant", content: finalText });
      } catch (err) {
        console.error("Aslan: gagal simpan riwayat chat (provider lain):", err);
      }
    });

    return finalText;
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = orderedHistory.map((m) => ({
    role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: m.content,
  }));

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

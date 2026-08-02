import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant/tools";

const MAX_TOOL_ITERATIONS = 5;

// Tool schemas never change between requests, so caching them (breakpoint on
// the last one covers the whole array) is a reliable, free latency win.
const CACHED_TOOLS: Anthropic.Tool[] = ASSISTANT_TOOLS.map((tool, i) =>
  i === ASSISTANT_TOOLS.length - 1
    ? { ...tool, cache_control: { type: "ephemeral" } }
    : tool
);

function textFromContent(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

// Haiku 4.5 doesn't support adaptive thinking or the effort parameter — sending
// either returns a 400. Opus 5 / Sonnet 5 support both.
function modelRequestExtras(model: string) {
  if (model === "claude-haiku-4-5") return {};
  return {
    thinking: { type: "adaptive" as const },
    output_config: { effort: "low" as const },
  };
}

// Shared by the web chat route and the Telegram webhook — runs one turn of
// the tool-use loop against a user's data and returns Aslan's final reply.
// Persists both the user and assistant messages after returning (via
// next/server's after()), so callers don't wait on the DB write.
export async function runAssistantChat(
  supabase: SupabaseClient,
  userId: string,
  userMessage: string,
  model: string,
  apiKey: string
): Promise<string> {
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

  const messages: Anthropic.MessageParam[] = [
    ...orderedHistory.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  let finalText = "";
  const auditRows: Array<{
    user_id: string;
    tool_name: string;
    input: Record<string, unknown>;
    result_ok: boolean;
    result_summary: string;
  }> = [];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages,
        tools: CACHED_TOOLS,
        ...modelRequestExtras(model),
      });

      if (response.stop_reason === "refusal") {
        finalText = "Maaf, aku nggak bisa bantu yang itu.";
        break;
      }

      if (response.stop_reason !== "tool_use") {
        finalText = textFromContent(response.content) || "(nggak ada respons)";
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

      if (i === MAX_TOOL_ITERATIONS - 1) {
        finalText = textFromContent(response.content) || "Selesai.";
      }
    }
  } catch (err) {
    // A tool call (e.g. a revoked Google token mid-loop) or the Claude API
    // call itself can throw. Fall back to a friendly reply instead of
    // letting it crash the route -- and critically, `auditRows` from any
    // tool calls that already succeeded earlier in this same loop are kept
    // and still persisted below, instead of vanishing from the Aktivitas
    // log along with the crash.
    console.error("Aslan: tool loop gagal di tengah jalan:", err);
    finalText =
      "Aduh, ada gangguan pas mroses ini. Coba lagi sebentar lagi -- kalau baru connect Gmail/Calendar, coba disconnect & connect ulang dari halaman ini.";
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

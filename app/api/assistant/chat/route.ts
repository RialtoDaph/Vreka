import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";
import { ASSISTANT_TOOLS, executeAssistantTool } from "@/lib/assistant/tools";

export const dynamic = "force-dynamic";

const MODEL = "claude-opus-5";
const MAX_TOOL_ITERATIONS = 5;

function textFromContent(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY belum di-set di server." },
      { status: 500 }
    );
  }

  await supabase.from("assistant_messages").insert({
    user_id: user.id,
    role: "user",
    content: userMessage,
  });

  const { data: history } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  const orderedHistory = (history ?? []).slice().reverse();

  const anthropic = new Anthropic({ apiKey });
  const systemPrompt = await buildAssistantSystemPrompt(supabase, user.id);

  const messages: Anthropic.MessageParam[] = orderedHistory.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools: ASSISTANT_TOOLS,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
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
      const { ok, result } = await executeAssistantTool(
        supabase,
        user.id,
        toolUse.name,
        (toolUse.input as Record<string, unknown>) ?? {}
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
        is_error: !ok,
      });
    }

    messages.push({ role: "user", content: toolResults });

    if (i === MAX_TOOL_ITERATIONS - 1) {
      finalText = textFromContent(response.content) || "Selesai.";
    }
  }

  await supabase.from("assistant_messages").insert({
    user_id: user.id,
    role: "assistant",
    content: finalText,
  });

  return NextResponse.json({ message: finalText });
}

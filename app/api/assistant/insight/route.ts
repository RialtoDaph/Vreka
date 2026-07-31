import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY belum di-set." }, { status: 500 });
  }

  try {
    const snapshot = await buildAssistantSystemPrompt(supabase, user.id);
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: snapshot,
      messages: [
        {
          role: "user",
          content:
            "Kasih 1 insight singkat (maksimal 2 kalimat) yang paling penting/actionable dari kondisi di atas — soal keuangan, deadline, atau progress belajar. Bahasa Indonesia santai. Langsung ke pointnya, jangan pake salam pembuka atau basa-basi.",
        },
      ],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const insight = textBlock?.text?.trim();
    if (!insight) {
      return NextResponse.json({ insight: null });
    }
    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: null });
  }
}

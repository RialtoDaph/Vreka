import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistantChat } from "@/lib/assistant/run";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
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
  const model = isValidAssistantModel(body?.model) ? body.model : DEFAULT_ASSISTANT_MODEL;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY belum di-set di server." },
      { status: 500 }
    );
  }

  try {
    const finalText = await runAssistantChat(supabase, user.id, userMessage, model, apiKey);
    return NextResponse.json({ message: finalText });
  } catch (err) {
    console.error("POST /api/assistant/chat gagal:", err);
    return NextResponse.json(
      { error: "Aslan lagi gangguan. Coba lagi sebentar lagi." },
      { status: 500 }
    );
  }
}

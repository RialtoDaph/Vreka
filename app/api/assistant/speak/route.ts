import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAiApiKey, sanitizeForSpeech, TTS_MODEL_ID, TTS_VOICE } from "@/lib/assistant/voice";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY belum di-set di server." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "Teks kosong." }, { status: 400 });
  }
  const text = sanitizeForSpeech(rawText);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: TTS_MODEL_ID,
        voice: TTS_VOICE,
        input: text,
        response_format: "mp3",
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: `Gagal bikin suara (${res.status}). ${detail.slice(0, 200)}` }, { status: 500 });
    }

    return new NextResponse(res.body, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal bikin suara." },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAiApiKey, STT_MODEL_ID } from "@/lib/assistant/voice";

export const dynamic = "force-dynamic";

// Whisper-family models are known to hallucinate a handful of stock phrases
// on silent/noise-only audio (e.g. "terima kasih", "thank you for watching")
// instead of returning nothing. OpenAI's transcription endpoint doesn't
// expose a per-request confidence score the way the previous provider did,
// so this stoplist is the direct mitigation for that specific known failure
// mode -- background noise shouldn't get relayed to Aslan as real speech.
const HALLUCINATION_STOPLIST = new Set([
  "terima kasih",
  "terima kasih.",
  "thank you",
  "thank you.",
  "thanks for watching",
  "thank you for watching",
  "thank you for watching!",
  "you",
  ".",
  "",
]);

function isLikelyHallucination(text: string): boolean {
  return HALLUCINATION_STOPLIST.has(text.trim().toLowerCase());
}

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

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Audio nggak ketemu." }, { status: 400 });
  }

  try {
    const upstreamForm = new FormData();
    upstreamForm.append("file", audio, "voice.webm");
    upstreamForm.append("model", STT_MODEL_ID);

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Gagal transkrip suara (${res.status}). ${detail.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const data = await res.json().catch(() => null);
    const text = typeof data?.text === "string" ? data.text : "";
    return NextResponse.json({ text: isLikelyHallucination(text) ? "" : text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal transkrip suara." },
      { status: 500 }
    );
  }
}

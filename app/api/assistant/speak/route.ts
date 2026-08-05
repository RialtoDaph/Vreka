import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getElevenLabsClient, sanitizeForSpeech, DEFAULT_VOICE_ID, TTS_MODEL_ID } from "@/lib/assistant/voice";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const elevenlabs = getElevenLabsClient();
  if (!elevenlabs) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY belum di-set di server." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  if (!rawText) {
    return NextResponse.json({ error: "Teks kosong." }, { status: 400 });
  }
  const text = sanitizeForSpeech(rawText);

  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: TTS_MODEL_ID,
      outputFormat: "mp3_44100_128",
    });
    return new NextResponse(audioStream as unknown as ReadableStream<Uint8Array>, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("POST /api/assistant/speak gagal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal bikin suara." },
      { status: 500 }
    );
  }
}

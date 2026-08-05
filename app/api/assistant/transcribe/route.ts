import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getElevenLabsClient, STT_MODEL_ID } from "@/lib/assistant/voice";

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

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "Audio nggak ketemu." }, { status: 400 });
  }

  try {
    const result = await elevenlabs.speechToText.convert({
      modelId: STT_MODEL_ID,
      file: audio,
    });
    if (!("text" in result)) {
      return NextResponse.json({ text: "" });
    }
    // ElevenLabs still returns *some* text for near-silent/noise-only clips —
    // it just doesn't have a real language to detect, so languageProbability
    // comes back low. Treat those as "nothing said" instead of trusting the
    // transcript, so background noise doesn't get relayed to Aslan as speech.
    const confident = result.languageProbability >= 0.5;
    return NextResponse.json({ text: confident ? result.text : "" });
  } catch (error) {
    console.error("POST /api/assistant/transcribe gagal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal transkrip suara." },
      { status: 500 }
    );
  }
}

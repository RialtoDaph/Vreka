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
    return NextResponse.json({ text: "text" in result ? result.text : "" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal transkrip suara." },
      { status: 500 }
    );
  }
}

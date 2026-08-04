import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";
import { getAslanMode } from "@/lib/assistant/modes";

export const dynamic = "force-dynamic";

// gpt-realtime-2.1-mini is OpenAI's current low-latency Realtime model as of
// this writing (the "-mini" tier keeps cost down; the full gpt-realtime-2.1
// trades some latency for GPT-5-class reasoning). Env-overridable in case
// the exact name drifts -- same reasoning as the other provider model IDs.
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "alloy";

// Mints a short-lived client secret the browser uses to open a WebRTC
// connection directly to OpenAI -- the real OPENAI_API_KEY never reaches the
// client. Realtime voice is Mode Santai-only (see lib/assistant/modes.ts),
// so the session is always built with Santai's persona, not whatever mode
// happens to be showing in the UI.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY belum di-set di server." }, { status: 500 });
  }

  const santai = getAslanMode("santai");
  const basePrompt = await buildAssistantSystemPrompt(supabase, user.id);
  const instructions = `${santai.persona}\n\n${basePrompt}\n\nKamu lagi ngobrol lewat suara real-time. Kamu cuma bisa ngobrol -- kamu TIDAK bisa nyatet transaksi, nambah tugas, atau ngelakuin aksi apa pun ke data user, cuma bisa cerita/jelasin dari info di atas.`;

  try {
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          audio: { output: { voice: REALTIME_VOICE } },
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Gagal bikin sesi realtime (${res.status}). ${detail.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const data = await res.json().catch(() => null);
    const clientSecret = data?.value;
    if (typeof clientSecret !== "string") {
      return NextResponse.json({ error: "Respons sesi realtime nggak lengkap." }, { status: 500 });
    }

    return NextResponse.json({ clientSecret, model: REALTIME_MODEL });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal bikin sesi realtime." },
      { status: 500 }
    );
  }
}

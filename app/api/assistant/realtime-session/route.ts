import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAssistantSystemPrompt } from "@/lib/assistant/context";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Lower than transcribe/speak's limit -- this mints one session per call
// *start*, not once per turn, so legitimate use never gets anywhere close
// to this. Mainly a backstop against a reconnect loop or bug racking up
// OpenAI Realtime sessions (its priciest per-token endpoint) unchecked.
const REALTIME_SESSION_RATE_LIMIT = 10;
const REALTIME_SESSION_RATE_WINDOW_MS = 5 * 60 * 1000;

// gpt-realtime-2.1-mini is OpenAI's current low-latency Realtime model as of
// this writing (the "-mini" tier keeps cost down; the full gpt-realtime-2.1
// trades some latency for GPT-5-class reasoning). Env-overridable in case
// the exact name drifts -- same reasoning as the other provider model IDs.
const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-2.1-mini";
const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || "alloy";

// Casual, ngobrol-santai persona for the dedicated GPT real-time voice
// button on Memory Map -- separate from Aslan's own (Claude-driven) voice
// loop, this is a lighter-weight, always-available "quick chat" option.
// Named "Nana" (not Aslan) deliberately, since this button runs on a
// different voice engine (OpenAI's own, not ElevenLabs) -- reusing Aslan's
// name here would read as the same character with a mismatched voice.
const REALTIME_PERSONA =
  "Nama kamu Nana. Gaya ngobrol kamu santai, ramah, bahasa kasual sehari-hari -- kayak lagi ngobrol sama temen deket. Jangan kaku atau kelewat formal.";

// Mints a short-lived client secret the browser uses to open a WebRTC
// connection directly to OpenAI -- the real OPENAI_API_KEY never reaches the
// client.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`realtime-session:${user.id}`, REALTIME_SESSION_RATE_LIMIT, REALTIME_SESSION_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan permintaan, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY belum di-set di server." }, { status: 500 });
  }

  const basePrompt = await buildAssistantSystemPrompt(supabase, user.id);
  const instructions = `${REALTIME_PERSONA}\n\n${basePrompt}\n\nKamu lagi ngobrol lewat suara real-time. Kamu cuma bisa ngobrol -- kamu TIDAK bisa nyatet transaksi, nambah tugas, atau ngelakuin aksi apa pun ke data user, cuma bisa cerita/jelasin dari info di atas.`;

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
      console.error(`POST /api/assistant/realtime-session gagal (${res.status}):`, detail.slice(0, 500));
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
    console.error("POST /api/assistant/realtime-session gagal:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal bikin sesi realtime." },
      { status: 500 }
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGmailAccessToken } from "@/lib/google/credentials";
import { sendDraft } from "@/lib/google/gmail";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// The only place a Gmail draft actually gets sent -- Aslan's
// draft_email_reply tool only ever creates a draft; sending it is a
// separate, explicit click the user makes here, in Vreka's own UI, never
// something a tool call does on its own.
const SEND_RATE_LIMIT = 20;
const SEND_RATE_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`gmail-send:${user.id}`, SEND_RATE_LIMIT, SEND_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan kirim, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const draftId = typeof body?.id === "string" ? body.id : "";
  if (!draftId) {
    return NextResponse.json({ error: "id draft kosong." }, { status: 400 });
  }

  const accessToken = await getGmailAccessToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Gmail belum di-connect." }, { status: 400 });
  }

  try {
    await sendDraft(accessToken, draftId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/google/gmail/drafts/send gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal kirim draft." },
      { status: 500 }
    );
  }
}

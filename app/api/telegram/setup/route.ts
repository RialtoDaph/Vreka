import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setTelegramWebhook } from "@/lib/telegram/bot";
import { getBaseUrl } from "@/lib/google/credentials";

export const dynamic = "force-dynamic";

// One-time (idempotent) step to point Telegram's webhook at this deployment.
// Gated behind login just so it isn't a fully public trigger — any logged-in
// Vreka user re-pointing their own bot's webhook at the current deployment
// is harmless and safe to repeat.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET belum di-set di server." },
      { status: 500 }
    );
  }

  const webhookUrl = `${getBaseUrl(request)}/api/telegram/webhook`;

  try {
    await setTelegramWebhook(webhookUrl, secret);
    return NextResponse.json({ ok: true, webhookUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal daftarin webhook." },
      { status: 500 }
    );
  }
}

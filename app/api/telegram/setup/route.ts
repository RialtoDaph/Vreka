import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setTelegramWebhook } from "@/lib/telegram/bot";
import { getBaseUrl } from "@/lib/google/credentials";

export const dynamic = "force-dynamic";

// Unlike the Google OAuth flow (which also uses getBaseUrl(), but is bounded
// by Google validating redirect_uri against an allowlist configured in
// Google Cloud Console), nothing on Telegram's side stops it from accepting
// whatever URL we register as the webhook. getBaseUrl() trusts the
// client-supplied X-Forwarded-Host header in production, so relying on it
// here would let any logged-in user repoint the one shared bot's webhook at
// an arbitrary host. VERCEL_PROJECT_PRODUCTION_URL is set by the platform
// itself (never influenced by request headers), so prefer it whenever this
// is actually running on Vercel; only fall back to the header-derived
// helper for local development, where NODE_ENV already makes it ignore the
// header and use the request's own origin instead.
function getTrustedBaseUrl(request: NextRequest): string {
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return prodUrl ? `https://${prodUrl}` : getBaseUrl(request);
}

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

  const webhookUrl = `${getTrustedBaseUrl(request)}/api/telegram/webhook`;

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

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens, getProfile } from "@/lib/google/gmail";
import { getBaseUrl } from "@/lib/google/credentials";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const base = getBaseUrl(request);
  const fail = (message: string) =>
    NextResponse.redirect(`${base}/dashboard/asisten?gmail_error=${encodeURIComponent(message)}`);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("google_oauth_state")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return fail("State nggak cocok, coba connect ulang.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return fail("Sesi login abis, login ulang dulu.");
  }

  try {
    const redirectUri = `${base}/api/google/oauth/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    if (!tokens.refresh_token) {
      return fail(
        "Google nggak ngasih refresh token. Cabut akses Vreka di myaccount.google.com/permissions dulu, terus connect ulang."
      );
    }
    const profile = await getProfile(tokens.access_token);

    const { error } = await supabase.from("google_credentials").upsert(
      {
        user_id: user.id,
        email_address: profile.emailAddress,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) return fail(error.message);

    const response = NextResponse.redirect(`${base}/dashboard/asisten?gmail=connected`);
    response.cookies.set("google_oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Gagal connect Gmail.");
  }
}

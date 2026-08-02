import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { refreshAccessToken } from "./gmail";

export async function getGmailAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("google_credentials")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.refresh_token) return null;
  return refreshAccessToken(data.refresh_token);
}

// Calendar access rides the same Google connection as Gmail, but the scope
// was added after launch — users who connected earlier only granted the
// Gmail scopes, so callers need to check `scope` before hitting the
// Calendar API (a stale token without it just 403s).
export async function getCalendarAccessToken(
  supabase: SupabaseClient,
  userId: string
): Promise<{ error: string } | { accessToken: string }> {
  const { data } = await supabase
    .from("google_credentials")
    .select("refresh_token, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.refresh_token) {
    return { error: "Google belum di-connect. Suruh user klik \"Connect Gmail\" di halaman Aslan dulu." };
  }
  if (!data.scope || !data.scope.includes("calendar")) {
    return {
      error:
        "Akses Google Calendar belum di-grant. Suruh user disconnect terus connect ulang Gmail (biar sekalian dapet izin Calendar).",
    };
  }
  const accessToken = await refreshAccessToken(data.refresh_token);
  return { accessToken };
}

// Same base-URL detection the /auth/callback route uses — Vercel terminates
// TLS upstream, so `origin` alone is the internal host, not the public one.
export function getBaseUrl(request: NextRequest): string {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  return process.env.NODE_ENV === "development" || !forwardedHost
    ? origin
    : `https://${forwardedHost}`;
}

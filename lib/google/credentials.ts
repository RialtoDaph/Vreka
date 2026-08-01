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

// Same base-URL detection the /auth/callback route uses — Vercel terminates
// TLS upstream, so `origin` alone is the internal host, not the public one.
export function getBaseUrl(request: NextRequest): string {
  const { origin } = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  return process.env.NODE_ENV === "development" || !forwardedHost
    ? origin
    : `https://${forwardedHost}`;
}

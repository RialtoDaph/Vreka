import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after the user clicks the email confirmation link.
// It appends ?code=... which has to be traded for a session cookie, otherwise
// the visitor lands back on /login still logged out.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // Vercel terminates TLS upstream, so `origin` is the internal host.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const base =
    process.env.NODE_ENV === "development" || !forwardedHost
      ? origin
      : `https://${forwardedHost}`;

  const fail = (message: string) =>
    NextResponse.redirect(`${base}/login?error=${encodeURIComponent(message)}`);

  // GoTrue forwards its own failures (expired link, already-used token) here.
  const authError = searchParams.get("error_description") ?? searchParams.get("error");
  if (authError) {
    return fail(authError);
  }

  if (!code) {
    return fail("Link konfirmasi tidak valid. Coba daftar ulang buat dapet link baru.");
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return fail(error.message);
  }

  return NextResponse.redirect(`${base}${next}`);
}

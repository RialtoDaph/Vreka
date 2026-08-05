import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase redirects here after the user clicks the email confirmation link.
// It appends ?code=... which has to be traded for a session cookie, otherwise
// the visitor lands back on /login still logged out.
// `next` has to stay a same-site relative path -- a value like "//evil.com"
// or "/\evil.com" is parsed by browsers as a protocol-relative URL (the
// scheme/host just come from wherever the request happens to redirect from),
// and "@evil.com" tacked onto the end of `base` gets read as userinfo,
// landing the visitor on a different host right after they click a
// legitimate confirmation-email link.
function isSafeNextPath(next: string): boolean {
  return /^\/(?!\/|\\)[^\s@]*$/.test(next);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = isSafeNextPath(rawNext) ? rawNext : "/dashboard";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return fail(error.message);
  }

  return NextResponse.redirect(`${base}${next}`);
}

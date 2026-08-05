import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isMfaGatedApiRoute, needsMfaChallenge, resolveAuthRedirect } from "@/lib/mfaGate";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const isAuthed = !!data.user;

  let aal = null;
  if (isAuthed) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    aal = aalData;
  }

  const pathname = request.nextUrl.pathname;

  // Session-cookie-authenticated API routes get the same aal2 gate as
  // dashboard pages, so a cookie stuck at aal1 (2FA enrolled but this
  // session hasn't cleared the challenge yet) can't reach them directly and
  // skip the second factor entirely. Not a redirect target like the page
  // routes below -- these are fetch()/webhook-style callers, so a 401 JSON
  // body is what the caller can actually act on.
  if (isAuthed && needsMfaChallenge(aal) && isMfaGatedApiRoute(pathname)) {
    return NextResponse.json({ error: "Verifikasi 2FA dulu sebelum lanjut." }, { status: 401 });
  }

  const redirectTo = resolveAuthRedirect({
    isAuthed,
    pathname,
    aal,
  });

  if (redirectTo) {
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/mfa",
    "/api/assistant/:path*",
    "/api/google/:path*",
    "/api/keuangan/:path*",
    "/api/push/:path*",
    "/api/telegram/link",
    "/api/telegram/setup",
  ],
};

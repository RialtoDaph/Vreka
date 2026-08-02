export type AalLevels = { currentLevel: string | null; nextLevel: string | null };

// A user with a *verified* TOTP factor still gets a normal (aal1) session
// right after password sign-in — Supabase doesn't block that on its own, the
// app has to. nextLevel only differs from currentLevel when a verified
// factor exists and this session hasn't cleared its MFA challenge yet.
export function needsMfaChallenge(aal: AalLevels | null): boolean {
  if (!aal) return false;
  return aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel;
}

// Pure routing decision for the auth/MFA gate — kept separate from proxy.ts
// (which can only be exercised against a live Supabase session) so every
// combination of auth state, route, and challenge status can be unit tested
// directly. Returns the path to redirect to, or null to let the request
// through unchanged.
export function resolveAuthRedirect(params: {
  isAuthed: boolean;
  pathname: string;
  aal: AalLevels | null;
}): "/login" | "/mfa" | "/dashboard" | null {
  const isAuthRoute = params.pathname.startsWith("/login");
  const isProtectedRoute = params.pathname.startsWith("/dashboard");
  const isMfaRoute = params.pathname.startsWith("/mfa");

  if (!params.isAuthed) {
    return isProtectedRoute || isMfaRoute ? "/login" : null;
  }

  const challenge = needsMfaChallenge(params.aal);

  if (isProtectedRoute) return challenge ? "/mfa" : null;
  if (isMfaRoute) return challenge ? null : "/dashboard";
  if (isAuthRoute) return challenge ? "/mfa" : "/dashboard";
  return null;
}

// API routes that authenticate via the normal Supabase session cookie (as
// opposed to a bearer/webhook secret) and can read or mutate real user
// data. 2FA used to only be enforced at page-routing layer (proxy.ts's old
// matcher only covered /dashboard, /login, /mfa) -- a session cookie stuck
// at aal1 (MFA enrolled but this session hasn't cleared the challenge, e.g.
// a stolen post-login-pre-MFA cookie) could call any of these directly and
// fully bypass the second factor. Deliberately an allowlist, not "all of
// /api/* except a blocklist": a route added here later without a session
// cookie (like the cron routes' CRON_SECRET or the Telegram webhook's
// signature) must never be added, since there's no user AAL to check for a
// server-to-server call -- an allowlist fails safe by simply not adding
// the extra gate, rather than accidentally gating a secret-authenticated
// route that has no session to inspect.
const MFA_GATED_API_PREFIXES = [
  "/api/assistant/",
  "/api/google/",
  "/api/push/",
  "/api/telegram/link",
  "/api/telegram/setup",
];

export function isMfaGatedApiRoute(pathname: string): boolean {
  return MFA_GATED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

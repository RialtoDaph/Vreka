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

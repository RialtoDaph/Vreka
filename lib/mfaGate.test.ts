import { describe, expect, it } from "vitest";
import { isMfaGatedApiRoute, needsMfaChallenge, resolveAuthRedirect } from "./mfaGate";

const NO_MFA = { currentLevel: "aal1", nextLevel: "aal1" };
const NEEDS_CHALLENGE = { currentLevel: "aal1", nextLevel: "aal2" };
const CHALLENGE_CLEARED = { currentLevel: "aal2", nextLevel: "aal2" };

describe("needsMfaChallenge", () => {
  it("is false when there's no AAL data at all", () => {
    expect(needsMfaChallenge(null)).toBe(false);
  });

  it("is false for a user with no MFA factor enrolled", () => {
    expect(needsMfaChallenge(NO_MFA)).toBe(false);
  });

  it("is true right after password sign-in when a verified factor exists", () => {
    expect(needsMfaChallenge(NEEDS_CHALLENGE)).toBe(true);
  });

  it("is false once the session has cleared the aal2 challenge", () => {
    expect(needsMfaChallenge(CHALLENGE_CLEARED)).toBe(false);
  });
});

describe("resolveAuthRedirect", () => {
  it("sends an unauthenticated visitor to /login from a protected route", () => {
    expect(resolveAuthRedirect({ isAuthed: false, pathname: "/dashboard/keuangan", aal: null })).toBe(
      "/login"
    );
  });

  it("sends an unauthenticated visitor to /login from the MFA challenge route too", () => {
    expect(resolveAuthRedirect({ isAuthed: false, pathname: "/mfa", aal: null })).toBe("/login");
  });

  it("lets an unauthenticated visitor reach /login itself", () => {
    expect(resolveAuthRedirect({ isAuthed: false, pathname: "/login", aal: null })).toBeNull();
  });

  it("lets a plain authenticated user (no MFA) through to the dashboard unchanged", () => {
    expect(
      resolveAuthRedirect({ isAuthed: true, pathname: "/dashboard/keuangan", aal: NO_MFA })
    ).toBeNull();
  });

  it("bounces a plain authenticated user away from /login to /dashboard", () => {
    expect(resolveAuthRedirect({ isAuthed: true, pathname: "/login", aal: NO_MFA })).toBe("/dashboard");
  });

  it("bounces a plain authenticated user away from /mfa (nothing to challenge)", () => {
    expect(resolveAuthRedirect({ isAuthed: true, pathname: "/mfa", aal: NO_MFA })).toBe("/dashboard");
  });

  it("redirects an MFA-enrolled user at aal1 away from the dashboard to /mfa", () => {
    expect(
      resolveAuthRedirect({ isAuthed: true, pathname: "/dashboard", aal: NEEDS_CHALLENGE })
    ).toBe("/mfa");
  });

  it("lets an MFA-enrolled user at aal1 stay on /mfa to complete the challenge", () => {
    expect(resolveAuthRedirect({ isAuthed: true, pathname: "/mfa", aal: NEEDS_CHALLENGE })).toBeNull();
  });

  it("sends an MFA-enrolled user hitting /login while still aal1 straight to /mfa", () => {
    expect(resolveAuthRedirect({ isAuthed: true, pathname: "/login", aal: NEEDS_CHALLENGE })).toBe(
      "/mfa"
    );
  });

  it("lets an MFA-enrolled user through to the dashboard once challenge is cleared", () => {
    expect(
      resolveAuthRedirect({ isAuthed: true, pathname: "/dashboard", aal: CHALLENGE_CLEARED })
    ).toBeNull();
  });

  it("bounces an MFA-enrolled, already-cleared user away from /mfa back to /dashboard", () => {
    expect(resolveAuthRedirect({ isAuthed: true, pathname: "/mfa", aal: CHALLENGE_CLEARED })).toBe(
      "/dashboard"
    );
  });
});

describe("isMfaGatedApiRoute", () => {
  it("gates session-cookie-authenticated API routes", () => {
    expect(isMfaGatedApiRoute("/api/assistant/chat")).toBe(true);
    expect(isMfaGatedApiRoute("/api/assistant/scan-receipt")).toBe(true);
    expect(isMfaGatedApiRoute("/api/google/oauth/start")).toBe(true);
    expect(isMfaGatedApiRoute("/api/google/oauth/callback")).toBe(true);
    expect(isMfaGatedApiRoute("/api/google/calendar/list")).toBe(true);
    expect(isMfaGatedApiRoute("/api/push/subscribe")).toBe(true);
    expect(isMfaGatedApiRoute("/api/push/unsubscribe")).toBe(true);
    expect(isMfaGatedApiRoute("/api/telegram/link")).toBe(true);
    expect(isMfaGatedApiRoute("/api/telegram/setup")).toBe(true);
  });

  it("never gates secret/webhook-authenticated routes -- they have no user session to check", () => {
    expect(isMfaGatedApiRoute("/api/cron/daily-digest")).toBe(false);
    expect(isMfaGatedApiRoute("/api/cron/recurring-post")).toBe(false);
    expect(isMfaGatedApiRoute("/api/telegram/webhook")).toBe(false);
  });

  it("does not gate unrelated paths", () => {
    expect(isMfaGatedApiRoute("/dashboard/keuangan")).toBe(false);
    expect(isMfaGatedApiRoute("/auth/callback")).toBe(false);
    expect(isMfaGatedApiRoute("/")).toBe(false);
  });
});

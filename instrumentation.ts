import * as Sentry from "@sentry/nextjs";

// No-ops entirely when SENTRY_DSN isn't set -- Sentry is opt-in observability,
// not a hard dependency, so a deployment that never configured it should
// behave exactly like it isn't installed at all.
export async function register() {
  if (!process.env.SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;

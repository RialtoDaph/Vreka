import * as Sentry from "@sentry/nextjs";

// dsn: undefined when NEXT_PUBLIC_SENTRY_DSN isn't set -- the SDK just
// never sends anything, same opt-in behavior as the server side.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

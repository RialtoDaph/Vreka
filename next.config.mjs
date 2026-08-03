import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// Wrapping is safe even when Sentry isn't configured at all -- without
// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN it just skips the source-map
// upload step instead of failing the build.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  telemetry: false,
  webpack: { treeshake: { removeDebugLogging: true } },
});

"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches errors thrown by the root layout itself (app/layout.tsx) -- a
// narrower `app/error.tsx` can't reach those, since it renders *inside*
// the root layout. This replaces the entire document when it fires, so it
// has to bring its own <html>/<body> and can't rely on globals.css classes
// resolving the same way (kept intentionally plain/inline for that reason).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05080d",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Vreka gagal dimuat
          </p>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>
            Ada error di level aplikasi. Coba muat ulang.
          </p>
          <button
            onClick={reset}
            style={{
              background: "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.5)",
              color: "#22d3ee",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "10px 16px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  );
}

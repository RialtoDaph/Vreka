"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA install/offline caching is a nice-to-have — a failed registration
      // shouldn't surface as a user-facing error.
    });
  }, []);

  return null;
}

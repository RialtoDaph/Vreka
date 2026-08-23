"use client";

import { useEffect } from "react";

// Reads the given query params off the URL on mount, hands them to
// `onParams` to turn into whatever local state the page needs, then strips
// them from the URL (history.replaceState) so a refresh doesn't re-trigger
// the notice. Reading via window.location.search in an effect -- rather
// than useSearchParams -- keeps the page statically rendered, no Suspense
// boundary required. Shared by /login (?error=/?notice=) and AI Core
// (?gmail=/?gmail_error=), which used to each hand-roll this same
// read-then-clean dance.
export function useQueryParamNotice(keys: string[], onParams: (params: URLSearchParams) => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!keys.some((k) => params.has(k))) return;
    onParams(params);
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
